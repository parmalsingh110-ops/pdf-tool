import * as pdfjsLib from 'pdfjs-dist';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
} from 'pdf-lib';
import { dataUrlToBytes, toArrayBufferBytes } from './blobUrl';
import { clampPdfScale, releaseCanvas, safeCanvasToDataUrl } from './safeCanvas';
import { sha256Hex } from './safeCrypto';

export interface CleanroomOptions {
  mode: 'structural' | 'paranoid_raster';
  stripZeroWidth: boolean;
  stripBeacons: boolean;
  stripAllUris: boolean; // True = strip ALL external HTTP/URI/Launch/SubmitForm beacons; False = suspicious beacons only
  stripExifImages: boolean;
  stripMetadata: boolean;
  stripJsActions: boolean;
  stripAttachments: boolean;
  suppressPrinterDots: boolean; // Active in paranoid_raster mode
}

export interface CleanroomAuditFinding {
  category: 'BEACON' | 'JS_ACTION' | 'EXIF_GPS' | 'METADATA' | 'STEGO' | 'ATTACHMENT' | 'GHOST_OBJECT';
  detail: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';
}

export interface PostCleanVerification {
  cleanVerified: boolean;
  remainingJs: number;
  remainingMetadata: number;
  remainingBeacons: number;
  remainingAttachments: number;
  xrefRevisions: number;
}

export interface CleanroomResult {
  blob: Blob;
  preSha256: string;
  postSha256: string;
  beaconsRemoved: number;
  metadataFieldsScrubbed: number;
  zeroWidthCharsStripped: number;
  javascriptActionsRemoved: number;
  exifSegmentsStripped: number;
  attachmentsRemoved: number;
  ghostObjectsPurged: number;
  printerDotsSuppressed: number;
  auditFindings: CleanroomAuditFinding[];
  verification: PostCleanVerification;
  networkRequestsDuringRun: number;
  timestamp: string;
}

const STEGO_UNICODE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFE00-\uFE0F\u{E0000}-\u{E007F}]/gu;
const SUSPICIOUS_URI_RE = /(canary|pixel|webhook|track|collect|beacon|analytics|oast|burp|interact\.sh|bit\.ly|tinyurl|grabify|iplogger)/i;

export async function computeBufferSha256(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  return sha256Hex(buffer);
}

async function runWebStreamCodec(bytes: Uint8Array, kind: 'deflate', dir: 'decompress' | 'compress'): Promise<Uint8Array | null> {
  try {
    const Ctor = dir === 'decompress' ? (globalThis as any).DecompressionStream : (globalThis as any).CompressionStream;
    if (!Ctor) return null;
    const stream = new Ctor(kind);
    const writer = stream.writable.getWriter();
    await writer.write(toArrayBufferBytes(bytes));
    await writer.close();
    const outBuf = await new Response(stream.readable).arrayBuffer();
    return new Uint8Array(outBuf);
  } catch {
    return null;
  }
}

/** Remove UTF-8 byte sequences for zero-width steganographic chars from binary/text stream bytes. */
function stripUtf8StegoBytes(buf: Uint8Array): { cleaned: Uint8Array; count: number } {
  const out: number[] = [];
  let count = 0;
  let i = 0;
  while (i < buf.length) {
    const b0 = buf[i];
    // U+200B..U+200F -> E2 80 8B..8F | U+202A..U+202E -> E2 80 AA..AE | U+2060..U+206F -> E2 81 A0..AF
    if (
      b0 === 0xe2 &&
      i + 2 < buf.length &&
      ((buf[i + 1] === 0x80 && ((buf[i + 2] >= 0x8b && buf[i + 2] <= 0x8f) || (buf[i + 2] >= 0xaa && buf[i + 2] <= 0xae))) ||
        (buf[i + 1] === 0x81 && buf[i + 2] >= 0xa0 && buf[i + 2] <= 0xaf))
    ) {
      count++;
      i += 3;
      continue;
    }
    // U+FE00..U+FE0F -> EF B8 80..8F | U+FEFF -> EF BB BF
    if (
      b0 === 0xef &&
      i + 2 < buf.length &&
      ((buf[i + 1] === 0xb8 && buf[i + 2] >= 0x80 && buf[i + 2] <= 0x8f) ||
        (buf[i + 1] === 0xbb && buf[i + 2] === 0xbf))
    ) {
      count++;
      i += 3;
      continue;
    }
    // Unicode Tag Block U+E0000..U+E007F -> F3 A0 80 80 .. F3 A0 81 BF
    if (
      b0 === 0xf3 &&
      i + 3 < buf.length &&
      buf[i + 1] === 0xa0 &&
      (buf[i + 2] === 0x80 || buf[i + 2] === 0x81)
    ) {
      count++;
      i += 4;
      continue;
    }
    out.push(b0);
    i++;
  }
  return { cleaned: count > 0 ? new Uint8Array(out) : buf, count };
}

/**
 * Lossless binary JPEG segment scrubber:
 * Removes EXIF/GPS (APP1), Photoshop IPTC (APP13), Adobe XMP, COM comments, and non-essential APPn segments
 * while leaving actual SOS DCT scan entropy untouched (0% pixel loss!).
 */
function scrubJpegBinaryMetadata(jpegBytes: Uint8Array): {
  cleaned: Uint8Array;
  segmentsRemoved: number;
  extractedNotes: string[];
} {
  if (jpegBytes.length < 4 || jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) {
    return { cleaned: jpegBytes, segmentsRemoved: 0, extractedNotes: [] };
  }

  const kept: number[] = [0xff, 0xd8];
  let i = 2;
  let removed = 0;
  const notes: string[] = [];

  while (i < jpegBytes.length) {
    if (jpegBytes[i] !== 0xff) {
      // Unexpected framing; return untouched rather than corrupting image
      return { cleaned: jpegBytes, segmentsRemoved: 0, extractedNotes: [] };
    }
    while (i < jpegBytes.length && jpegBytes[i] === 0xff) i++;
    if (i >= jpegBytes.length) break;

    const marker = jpegBytes[i];
    i++;

    // Start Of Scan (0xDA) or EOI (0xD9): copy remainder of entropy stream verbatim
    if (marker === 0xda) {
      kept.push(0xff, marker);
      for (let j = i; j < jpegBytes.length; j++) kept.push(jpegBytes[j]);
      break;
    }
    if (marker === 0xd9) {
      kept.push(0xff, marker);
      break;
    }
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      kept.push(0xff, marker);
      continue;
    }

    if (i + 1 >= jpegBytes.length) break;
    const segLen = (jpegBytes[i] << 8) | jpegBytes[i + 1];
    if (segLen < 2 || i + segLen > jpegBytes.length) {
      return { cleaned: jpegBytes, segmentsRemoved: 0, extractedNotes: [] };
    }

    // APP1..APP15 (0xE1..0xEF) and COM (0xFE) contain camera model, GPS, XMP, Photoshop, comments
    const isSensitiveApp = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (isSensitiveApp) {
      removed++;
      // Inspect printable clues for user audit certificate
      try {
        const segText = new TextDecoder('latin1').decode(jpegBytes.subarray(i + 2, i + segLen));
        const hints: string[] = [];
        if (segText.includes('Exif')) hints.push('EXIF Header');
        if (segText.includes('GPS') || segText.includes('WGS')) hints.push('GPS Coordinates');
        if (segText.includes('Photoshop')) hints.push('Adobe Photoshop');
        if (segText.includes('iPhone') || segText.includes('Canon') || segText.includes('Nikon') || segText.includes('Samsung')) {
          hints.push('Device/Camera Model');
        }
        if (segText.includes('xmp') || segText.includes('XMP')) hints.push('Adobe XMP Stream');
        if (hints.length > 0) {
          notes.push(`APP${marker === 0xfe ? '-COM' : marker - 0xe0}: ${hints.join(', ')}`);
        }
      } catch {}
      i += segLen;
      continue;
    }

    kept.push(0xff, marker);
    for (let k = i; k < i + segLen; k++) kept.push(jpegBytes[k]);
    i += segLen;
  }

  return {
    cleaned: removed > 0 ? new Uint8Array(kept) : jpegBytes,
    segmentsRemoved: removed,
    extractedNotes: notes,
  };
}

function countPatternInRawBytes(bytes: Uint8Array, needleAscii: string): number {
  const txt = new TextDecoder('latin1').decode(bytes);
  const re = new RegExp(needleAscii.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  return (txt.match(re) || []).length;
}

function measurePerfNetworkCount(): number {
  try {
    if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
      return performance.getEntriesByType('resource').length;
    }
  } catch {}
  return 0;
}

async function inspectAndVerifyOutput(bytes: Uint8Array): Promise<PostCleanVerification> {
  const xrefRevisions = countPatternInRawBytes(bytes, 'startxref');
  let remainingJs = 0;
  let remainingMetadata = 0;
  let remainingBeacons = 0;
  let remainingAttachments = 0;

  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const cat = doc.catalog;
    if (cat.has(PDFName.of('OpenAction'))) remainingJs++;
    if (cat.has(PDFName.of('AA'))) remainingJs++;
    if (cat.has(PDFName.of('Metadata'))) remainingMetadata++;
    if (cat.has(PDFName.of('PieceInfo'))) remainingMetadata++;

    const namesRef = cat.get(PDFName.of('Names'));
    const namesDict = doc.context.lookup(namesRef);
    if (namesDict instanceof PDFDict) {
      if (namesDict.has(PDFName.of('JavaScript'))) remainingJs++;
      if (namesDict.has(PDFName.of('EmbeddedFiles'))) remainingAttachments++;
    }

    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFDict) {
        const sObj = obj.get(PDFName.of('S'));
        const sName = sObj instanceof PDFName ? sObj.asString() : '';
        if (['/JavaScript', '/Launch', '/SubmitForm', '/ImportData', '/GoToR', '/GoToE'].includes(sName)) {
          remainingBeacons++;
        }
        if (obj.has(PDFName.of('JS')) || obj.has(PDFName.of('JavaScript'))) {
          remainingJs++;
        }
      }
    }
  } catch {}

  const cleanVerified = remainingJs === 0 && remainingMetadata === 0 && remainingBeacons === 0 && remainingAttachments === 0;
  return {
    cleanVerified,
    remainingJs,
    remainingMetadata,
    remainingBeacons,
    remainingAttachments,
    xrefRevisions,
  };
}

export async function executeCleanroomSanitization(
  rawBytes: ArrayBuffer,
  options: CleanroomOptions
): Promise<CleanroomResult> {
  const netBefore = measurePerfNetworkCount();
  const preBytes = new Uint8Array(rawBytes);
  const preSha256 = await computeBufferSha256(preBytes);

  const findings: CleanroomAuditFinding[] = [];
  let beaconsRemoved = 0;
  let metadataFieldsScrubbed = 0;
  let zeroWidthCharsStripped = 0;
  let javascriptActionsRemoved = 0;
  let exifSegmentsStripped = 0;
  let attachmentsRemoved = 0;
  let ghostObjectsPurged = 0;
  let printerDotsSuppressed = 0;

  const origXrefCount = countPatternInRawBytes(preBytes, 'startxref');
  if (origXrefCount > 1) {
    ghostObjectsPurged += origXrefCount - 1;
    findings.push({
      category: 'GHOST_OBJECT',
      severity: 'HIGH',
      detail: `Found ${origXrefCount} incremental %%EOF revisions (PDF edit history). Rebuilding clean object graph purges deleted ghost objects.`,
    });
  }

  let outputBytes: Uint8Array;

  if (options.mode === 'paranoid_raster') {
    // ── Mode B: Paranoid Stego-Proof Pixel Reconstruction ─────────────────────
    const srcPdf = await pdfjsLib.getDocument({ data: preBytes.slice(0) }).promise;
    const newPdf = await PDFDocument.create();

    for (let p = 1; p <= srcPdf.numPages; p++) {
      const page = await srcPdf.getPage(p);
      const baseVp = page.getViewport({ scale: 1.0 });
      const safeScale = clampPdfScale(baseVp.width, baseVp.height, 2.3);
      const renderVp = page.getViewport({ scale: safeScale }); // ~166 DPI crisp sovereign flattening (mobile-clamped)

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(renderVp.width);
      canvas.height = Math.round(renderVp.height);
      let jpgArr: Uint8Array;
      try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, canvas, viewport: renderVp }).promise;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = imgData.data;

        if (options.suppressPrinterDots) {
          // Suppress periodic laser printer MIC yellow micro-dots (faint R/G >= 238, dipped Blue 175..244 on paper background)
          for (let idx = 0; idx < px.length; idx += 4) {
            const r = px[idx];
            const g = px[idx + 1];
            const b = px[idx + 2];
            if (r >= 238 && g >= 238 && b >= 165 && b <= 244 && Math.abs(r - g) <= 14 && r - b >= 10) {
              px[idx] = 255;
              px[idx + 1] = 255;
              px[idx + 2] = 255;
              printerDotsSuppressed++;
            } else {
              // Scrub LSB steganography parity noise on near-white paper pixels
              if (r >= 250 && g >= 250 && b >= 250) {
                px[idx] = 255;
                px[idx + 1] = 255;
                px[idx + 2] = 255;
              }
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

        const jpgDataUrl = safeCanvasToDataUrl(canvas, 'image/jpeg', 0.92);
        jpgArr = dataUrlToBytes(jpgDataUrl);
      } finally {
        releaseCanvas(canvas);
      }

      const embeddedJpg = await newPdf.embedJpg(jpgArr);
      const outPage = newPdf.addPage([baseVp.width, baseVp.height]);
      outPage.drawImage(embeddedJpg, { x: 0, y: 0, width: baseVp.width, height: baseVp.height });
    }

    // Explicitly zero metadata fields
    newPdf.setTitle('');
    newPdf.setAuthor('');
    newPdf.setSubject('');
    newPdf.setKeywords([]);
    newPdf.setProducer('');
    newPdf.setCreator('');
    metadataFieldsScrubbed += 6;
    findings.push({
      category: 'STEGO',
      severity: 'INFO',
      detail: `Flattened all ${srcPdf.numPages} page(s) to fresh pixel canvas, dropping all original PDF fonts, JS trees, links, EXIF headers, and ghost revisions.`,
    });
    if (printerDotsSuppressed > 0) {
      findings.push({
        category: 'STEGO',
        severity: 'MEDIUM',
        detail: `Suppressed ${printerDotsSuppressed.toLocaleString()} faint yellow/LSB micro-pixels on paper background.`,
      });
    }

    outputBytes = await newPdf.save({ useObjectStreams: false });
  } else {
    // ── Mode A: Lossless Deep Structural Sovereign Cleanroom ──────────────────
    const pdfDoc = await PDFDocument.load(preBytes, { ignoreEncryption: true });
    const ctx = pdfDoc.context;

    // 1. Metadata & Software Fingerprints
    if (options.stripMetadata) {
      try {
        const oldProducer = pdfDoc.getProducer();
        const oldCreator = pdfDoc.getCreator();
        const oldAuthor = pdfDoc.getAuthor();
        if (oldProducer || oldCreator || oldAuthor) {
          findings.push({
            category: 'METADATA',
            severity: 'MEDIUM',
            detail: `Wiped identifying /Info tags (Author: ${oldAuthor || '—'}, Creator: ${oldCreator || '—'}, Producer: ${oldProducer || '—'}).`,
          });
        }
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('');
        pdfDoc.setCreator('');
        metadataFieldsScrubbed += 6;

        // Also wipe custom /Info entries
        const trailerInfo = ctx.trailerInfo.Info;
        if (trailerInfo) {
          const infoDict = ctx.lookup(trailerInfo);
          if (infoDict instanceof PDFDict) {
            for (const key of infoDict.keys()) {
              infoDict.delete(key);
              metadataFieldsScrubbed++;
            }
          }
        }

        if (pdfDoc.catalog.has(PDFName.of('Metadata'))) {
          pdfDoc.catalog.delete(PDFName.of('Metadata'));
          metadataFieldsScrubbed++;
          findings.push({ category: 'METADATA', severity: 'HIGH', detail: 'Deleted Catalog XML/XMP /Metadata stream.' });
        }
        if (pdfDoc.catalog.has(PDFName.of('PieceInfo'))) {
          pdfDoc.catalog.delete(PDFName.of('PieceInfo'));
          metadataFieldsScrubbed++;
          findings.push({ category: 'METADATA', severity: 'HIGH', detail: 'Deleted Adobe/App /PieceInfo proprietary state.' });
        }
      } catch {}
    }

    // 2. Catalog & Names JavaScript / Embedded Attachments Purge
    if (options.stripJsActions) {
      if (pdfDoc.catalog.has(PDFName.of('OpenAction'))) {
        pdfDoc.catalog.delete(PDFName.of('OpenAction'));
        javascriptActionsRemoved++;
        findings.push({ category: 'JS_ACTION', severity: 'CRITICAL', detail: 'Removed auto-executing Catalog /OpenAction trigger.' });
      }
      if (pdfDoc.catalog.has(PDFName.of('AA'))) {
        pdfDoc.catalog.delete(PDFName.of('AA'));
        javascriptActionsRemoved++;
        findings.push({ category: 'JS_ACTION', severity: 'CRITICAL', detail: 'Removed Catalog Additional-Actions (/AA) trigger.' });
      }
    }

    const namesRef = pdfDoc.catalog.get(PDFName.of('Names'));
    const namesDict = ctx.lookup(namesRef);
    if (namesDict instanceof PDFDict) {
      if (options.stripJsActions && namesDict.has(PDFName.of('JavaScript'))) {
        namesDict.delete(PDFName.of('JavaScript'));
        javascriptActionsRemoved++;
        findings.push({ category: 'JS_ACTION', severity: 'CRITICAL', detail: 'Deleted embedded document-level /JavaScript payload tree.' });
      }
      if (options.stripAttachments && namesDict.has(PDFName.of('EmbeddedFiles'))) {
        namesDict.delete(PDFName.of('EmbeddedFiles'));
        attachmentsRemoved++;
        findings.push({ category: 'ATTACHMENT', severity: 'HIGH', detail: 'Deleted /EmbeddedFiles attachment container.' });
      }
    }

    if (options.stripAttachments) {
      const acroRef = pdfDoc.catalog.get(PDFName.of('AcroForm'));
      const acroDict = ctx.lookup(acroRef);
      if (acroDict instanceof PDFDict && acroDict.has(PDFName.of('XFA'))) {
        acroDict.delete(PDFName.of('XFA'));
        attachmentsRemoved++;
        findings.push({ category: 'ATTACHMENT', severity: 'HIGH', detail: 'Removed executable XML Forms Architecture (/XFA) payload.' });
      }
    }

    // 3. Page-level Annots, Triggers, PieceInfo, Thumbnails, XMP
    for (let pIdx = 0; pIdx < pdfDoc.getPageCount(); pIdx++) {
      const page = pdfDoc.getPage(pIdx);
      if (options.stripJsActions && page.node.has(PDFName.of('AA'))) {
        page.node.delete(PDFName.of('AA'));
        javascriptActionsRemoved++;
      }
      if (options.stripMetadata) {
        if (page.node.has(PDFName.of('PieceInfo'))) {
          page.node.delete(PDFName.of('PieceInfo'));
          metadataFieldsScrubbed++;
        }
        if (page.node.has(PDFName.of('Metadata'))) {
          page.node.delete(PDFName.of('Metadata'));
          metadataFieldsScrubbed++;
        }
        if (page.node.has(PDFName.of('Thumb'))) {
          page.node.delete(PDFName.of('Thumb'));
          metadataFieldsScrubbed++;
        }
      }

      const annotsRef = page.node.get(PDFName.of('Annots'));
      const annotsArr = ctx.lookup(annotsRef);
      if (annotsArr instanceof PDFArray) {
        const preserved = ctx.obj([]) as PDFArray;
        for (let a = 0; a < annotsArr.size(); a++) {
          const annotRef = annotsArr.get(a);
          const annotDict = ctx.lookup(annotRef);
          if (!(annotDict instanceof PDFDict)) {
            preserved.push(annotRef);
            continue;
          }

          if (options.stripJsActions && annotDict.has(PDFName.of('AA'))) {
            annotDict.delete(PDFName.of('AA'));
            javascriptActionsRemoved++;
          }

          const subtypeObj = annotDict.get(PDFName.of('Subtype'));
          const subtypeName = subtypeObj instanceof PDFName ? subtypeObj.asString() : '';
          if (options.stripAttachments && subtypeName === '/FileAttachment') {
            attachmentsRemoved++;
            findings.push({
              category: 'ATTACHMENT',
              severity: 'HIGH',
              detail: `Removed embedded /FileAttachment annotation on Page ${pIdx + 1}.`,
            });
            continue;
          }

          const actionRef = annotDict.get(PDFName.of('A'));
          const actionDict = ctx.lookup(actionRef);
          let dropAnnot = false;
          if (actionDict instanceof PDFDict) {
            const s = actionDict.get(PDFName.of('S'));
            const sName = s instanceof PDFName ? s.asString() : '';

            if (options.stripJsActions && sName === '/JavaScript') {
              javascriptActionsRemoved++;
              dropAnnot = true;
              findings.push({
                category: 'JS_ACTION',
                severity: 'CRITICAL',
                detail: `Disarmed JavaScript annotation trigger on Page ${pIdx + 1}.`,
              });
            } else if (
              options.stripBeacons &&
              ['/Launch', '/SubmitForm', '/ImportData', '/GoToR', '/GoToE', '/RichMedia', '/Sound', '/Movie'].includes(sName)
            ) {
              beaconsRemoved++;
              dropAnnot = true;
              findings.push({
                category: 'BEACON',
                severity: 'CRITICAL',
                detail: `Neutralized remote/executable action (${sName}) on Page ${pIdx + 1}.`,
              });
            } else if (options.stripBeacons && sName === '/URI') {
              const uriRef = actionDict.get(PDFName.of('URI'));
              const uriObj = ctx.lookup(uriRef);
              const uriStr = uriObj instanceof PDFString || uriObj instanceof PDFHexString ? uriObj.asString() : String(uriObj || '');
              const shouldStripUri = options.stripAllUris || SUSPICIOUS_URI_RE.test(uriStr);
              if (shouldStripUri) {
                beaconsRemoved++;
                dropAnnot = true;
                findings.push({
                  category: 'BEACON',
                  severity: SUSPICIOUS_URI_RE.test(uriStr) ? 'CRITICAL' : 'MEDIUM',
                  detail: `Stripped external URI beacon on Page ${pIdx + 1}: ${uriStr.slice(0, 75)}`,
                });
              }
            }
          }

          if (!dropAnnot) {
            preserved.push(annotRef);
          }
        }
        if (preserved.size() > 0) {
          page.node.set(PDFName.of('Annots'), preserved);
        } else {
          page.node.delete(PDFName.of('Annots'));
        }
      }
    }

    // 4. Indirect Object Sweep: Zero-Width Stego in Strings AND Decompressed Content Streams + JPEG EXIF Scrubbing
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (options.stripZeroWidth && (obj instanceof PDFString || obj instanceof PDFHexString)) {
        const strVal = obj.asString();
        const matches = strVal.match(STEGO_UNICODE_RE);
        if (matches) {
          zeroWidthCharsStripped += matches.length;
          ctx.assign(ref, PDFString.of(strVal.replace(STEGO_UNICODE_RE, '')));
        }
        continue;
      }

      if (obj instanceof PDFDict) {
        if (options.stripJsActions) {
          if (obj.has(PDFName.of('JS'))) {
            obj.delete(PDFName.of('JS'));
            javascriptActionsRemoved++;
          }
          if (obj.has(PDFName.of('JavaScript'))) {
            obj.delete(PDFName.of('JavaScript'));
            javascriptActionsRemoved++;
          }
        }
        if (options.stripMetadata && obj.has(PDFName.of('Metadata'))) {
          obj.delete(PDFName.of('Metadata'));
          metadataFieldsScrubbed++;
        }
      }

      if (obj instanceof PDFRawStream) {
        const dict = obj.dict;
        const subtypeObj = dict.get(PDFName.of('Subtype'));
        const filterObj = dict.get(PDFName.of('Filter'));
        const subtypeStr = subtypeObj instanceof PDFName ? subtypeObj.asString() : '';
        const filterStr = filterObj instanceof PDFName ? filterObj.asString() : '';

        // 4A. Scrub EXIF / GPS / XMP inside embedded JPEG XObjects
        if (options.stripExifImages && subtypeStr === '/Image' && filterStr === '/DCTDecode') {
          const { cleaned, segmentsRemoved, extractedNotes } = scrubJpegBinaryMetadata(obj.contents);
          if (segmentsRemoved > 0) {
            exifSegmentsStripped += segmentsRemoved;
            const replacementStream = PDFRawStream.of(dict, cleaned);
            dict.set(PDFName.of('Length'), PDFNumber.of(cleaned.length));
            ctx.assign(ref, replacementStream);
            findings.push({
              category: 'EXIF_GPS',
              severity: 'HIGH',
              detail: `Scrubbed ${segmentsRemoved} JPEG metadata segment(s)${extractedNotes.length ? ` (${extractedNotes[0]})` : ''}.`,
            });
          }
        }

        // 4B. Strip Steganographic Zero-Width Sequences inside Decompressed FlateDecode Streams
        if (options.stripZeroWidth && subtypeStr !== '/Image' && filterStr === '/FlateDecode') {
          const decompressed = await runWebStreamCodec(obj.contents, 'deflate', 'decompress');
          if (decompressed) {
            const { cleaned, count } = stripUtf8StegoBytes(decompressed);
            if (count > 0) {
              const recompressed = await runWebStreamCodec(cleaned, 'deflate', 'compress');
              if (recompressed) {
                zeroWidthCharsStripped += count;
                const repStream = PDFRawStream.of(dict, recompressed);
                dict.set(PDFName.of('Length'), PDFNumber.of(recompressed.length));
                ctx.assign(ref, repStream);
              }
            }
          }
        }
      }
    }

    if (zeroWidthCharsStripped > 0) {
      findings.push({
        category: 'STEGO',
        severity: 'CRITICAL',
        detail: `Purged ${zeroWidthCharsStripped} hidden zero-width / steganographic Unicode watermark characters across streams and strings.`,
      });
    }

    // 5. Re-assemble pages into a fresh PDFDocument to burn deleted ghost revisions/incremental updates
    const rebuiltDoc = await PDFDocument.create();
    const indices = pdfDoc.getPageIndices();
    const copiedPages = await rebuiltDoc.copyPages(pdfDoc, indices);
    for (const cp of copiedPages) {
      rebuiltDoc.addPage(cp);
    }
    if (options.stripMetadata) {
      rebuiltDoc.setTitle('');
      rebuiltDoc.setAuthor('');
      rebuiltDoc.setSubject('');
      rebuiltDoc.setKeywords([]);
      rebuiltDoc.setProducer('');
      rebuiltDoc.setCreator('');
    }
    outputBytes = await rebuiltDoc.save({ useObjectStreams: false });
  }

  const postSha256 = await computeBufferSha256(outputBytes);
  const verification = await inspectAndVerifyOutput(outputBytes);
  const netAfter = measurePerfNetworkCount();

  return {
    blob: new Blob([toArrayBufferBytes(outputBytes)], { type: 'application/pdf' }),
    preSha256,
    postSha256,
    beaconsRemoved,
    metadataFieldsScrubbed,
    zeroWidthCharsStripped,
    javascriptActionsRemoved,
    exifSegmentsStripped,
    attachmentsRemoved,
    ghostObjectsPurged,
    printerDotsSuppressed,
    auditFindings: findings,
    verification,
    networkRequestsDuringRun: Math.max(0, netAfter - netBefore),
    timestamp: new Date().toISOString(),
  };
}
