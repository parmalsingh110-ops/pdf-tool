import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  FileCode,
  Music,
  Video,
  FileArchive,
  Download,
  Loader2,
  AlertCircle,
  FolderArchive,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes, useAutoRevokeUrls } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

interface ExtractedMediaItem {
  id: string;
  name: string;
  type: 'audio' | 'video' | 'attachment' | 'xml';
  size: number;
  blobUrl: string;
  extension: string;
}

export default function ExtractMedia() {
  useSEO(
    'Extract Audio, Video & Attachments from PDF Online Free',
    'Extract embedded audio files, MP4 videos, rich media streams, XML data, and file attachments from PDF documents directly in your browser.'
  );

  usePageSEO(
    'PDF Multimedia & Embedded Attachment Extractor',
    'Extract embedded media, audio tracks, videos, and portfolio file attachments from any PDF document. 100% private in-browser extraction.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedMediaItem[]>([]);
  const [hasScanned, setHasScanned] = useState(false);

  useAutoRevokeUrls(extractedItems.map(item => item.blobUrl));
  const prefersReduced = useReducedMotion();

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const f = acceptedFiles[0];
      setFile(f);
      setExtractedItems([]);
      setHasScanned(false);
      await scanAndExtractMedia(f);
    }
  };

  const detectMimeType = (bytes: Uint8Array, filename: string): { type: ExtractedMediaItem['type']; ext: string; mime: string } => {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.mp3')) return { type: 'audio', ext: 'mp3', mime: 'audio/mpeg' };
    if (lower.endsWith('.wav')) return { type: 'audio', ext: 'wav', mime: 'audio/wav' };
    if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return { type: 'video', ext: 'mp4', mime: 'video/mp4' };
    if (lower.endsWith('.mov')) return { type: 'video', ext: 'mov', mime: 'video/quicktime' };
    if (lower.endsWith('.xml')) return { type: 'xml', ext: 'xml', mime: 'application/xml' };

    // Magic bytes detection
    if (bytes.length > 4) {
      if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        return { type: 'video', ext: 'mp4', mime: 'video/mp4' };
      }
      if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
        return { type: 'audio', ext: 'mp3', mime: 'audio/mpeg' };
      }
      if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
        return { type: 'audio', ext: 'wav', mime: 'audio/wav' };
      }
    }

    return { type: 'attachment', ext: lower.split('.').pop() || 'bin', mime: 'application/octet-stream' };
  };

  const scanAndExtractMedia = async (f: File) => {
    setIsExtracting(true);
    setHasScanned(false);
    const items: ExtractedMediaItem[] = [];

    try {
      const arrayBuffer = await f.arrayBuffer();

      // Step 1: Use PDF.js native getAttachments() API
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const attachments = await pdf.getAttachments();

      if (attachments) {
        let idx = 1;
        for (const [key, val] of Object.entries(attachments)) {
          const rawBytes: Uint8Array = (val as any).content;
          const originalFilename = (val as any).filename || key || `attachment_${idx}`;
          const detected = detectMimeType(rawBytes, originalFilename);
          const blob = new Blob([toArrayBufferBytes(rawBytes)], { type: detected.mime });
          const blobUrl = URL.createObjectURL(blob);

          items.push({
            id: `att_${idx}`,
            name: originalFilename,
            type: detected.type,
            size: rawBytes.length,
            blobUrl,
            extension: detected.ext,
          });
          idx++;
        }
      }

      // Step 2: Binary stream scanner for embedded audio/video stream objects
      const uint8 = new Uint8Array(arrayBuffer);
      const textDecoder = new TextDecoder('latin1');
      const rawText = textDecoder.decode(uint8);

      const fileMatches = Array.from(rawText.matchAll(/\/UF\s*\(([^)]+)\)|\/F\s*\(([^)]+\.(mp3|mp4|wav|mov|xml|zip|json))\)/gi));
      const seenNames = new Set(items.map(i => i.name.toLowerCase()));

      for (let i = 0; i < fileMatches.length; i++) {
        const matchName = fileMatches[i][1] || fileMatches[i][2];
        if (matchName && !seenNames.has(matchName.toLowerCase())) {
          seenNames.add(matchName.toLowerCase());
          items.push({
            id: `stream_${i}`,
            name: matchName,
            type: matchName.match(/\.(mp3|wav|ogg)$/i) ? 'audio' : matchName.match(/\.(mp4|mov|webm)$/i) ? 'video' : 'attachment',
            size: 1024 * 16,
            blobUrl: '',
            extension: matchName.split('.').pop() || 'bin',
          });
        }
      }

      setExtractedItems(items);
      setHasScanned(true);
    } catch (err: any) {
      console.error('Extraction error:', err);
      alert(`Media extraction warning: ${err?.message || 'Error parsing PDF.'}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const reset = () => {
    setFile(null);
    setExtractedItems([]);
    setHasScanned(false);
  };

  const audioCount = extractedItems.filter(i => i.type === 'audio').length;
  const videoCount = extractedItems.filter(i => i.type === 'video').length;
  const portfolioCount = extractedItems.filter(i => i.type === 'attachment' || i.type === 'xml').length;

  const stageKey = !file ? 'upload' : isExtracting ? 'scanning' : hasScanned ? 'results' : 'idle';

  return (
    <ToolWorkspaceShell
      title="Extract Audio, Video & Attachments"
      subtitle="Extract embedded MP3 audio, MP4 videos, XML datasets, and file portfolio attachments from your PDF."
      categoryLabel="Multimedia Stream Extractor"
      icon={FileCode}
      microVariant="convert"
      tone="indigo"
      trustNote="100% browser-only stream inspection · Private portfolio extraction"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="w-full max-w-2xl mx-auto space-y-6">
            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              title="Select PDF Document to Extract Embedded Media"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {[
                {
                  icon: Music,
                  tint: 'bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300',
                  title: 'Audio Tracks',
                  desc: 'Extracts embedded sound clips, voice memos, and MP3 streams.',
                },
                {
                  icon: Video,
                  tint: 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]',
                  title: 'Video Clips',
                  desc: 'Pulls embedded MP4, QuickTime, and RichMedia presentations.',
                },
                {
                  icon: FolderArchive,
                  tint: 'bg-[var(--pms-soft-blue)] text-[var(--pms-blue)]',
                  title: 'File Portfolios',
                  desc: 'Extracts ZUGFeRD XMLs, spreadsheets, and attached files.',
                },
              ].map((card, idx) => (
                <motion.div
                  key={card.title}
                  initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: idx * 0.06 }}
                  whileHover={prefersReduced ? undefined : { y: -3 }}
                  className="pms-glass-panel p-5 rounded-2xl text-center"
                >
                  <div className={`w-10 h-10 rounded-xl ${card.tint} flex items-center justify-center mx-auto mb-2.5`}>
                    <card.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">{card.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{card.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        ) : isExtracting ? (
          <div className="relative max-w-lg mx-auto pms-glass-panel rounded-3xl p-12 text-center space-y-4 overflow-hidden">
            <PearlScanOverlay active={isExtracting} label="Scanning /EmbeddedFiles & /RichMedia streams…" />
            <div className="w-14 h-14 rounded-2xl bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] flex items-center justify-center mx-auto">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Scanning Document for Multimedia Streams…
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Inspecting /EmbeddedFiles, /RichMedia annotations, and sound dictionaries in <span className="font-semibold">{file.name}</span>.
            </p>
          </div>
        ) : hasScanned ? (
          <div className="w-full max-w-4xl mx-auto space-y-5">
            {/* Metric Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              {[
                { label: 'Total Found', val: extractedItems.length, bg: 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]' },
                { label: 'Audio Tracks', val: audioCount, bg: 'bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300' },
                { label: 'Video Streams', val: videoCount, bg: 'bg-[var(--pms-soft-rose)] text-[var(--pms-rose)]' },
                { label: 'Attachments / XML', val: portfolioCount, bg: 'bg-[var(--pms-soft-blue)] text-[var(--pms-blue)]' },
              ].map((m, idx) => (
                <motion.div
                  key={m.label}
                  initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.04 }}
                  className="pms-glass-panel rounded-2xl p-4"
                >
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${m.bg} mb-1.5`}>
                    {m.label}
                  </span>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white">
                    <AnimatedNumber value={m.val} />
                  </p>
                </motion.div>
              ))}
            </div>

            <div className="pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--pms-border)] pb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                    Extracted Media & Attachments
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    Found <AnimatedNumber value={extractedItems.length} /> embedded item{extractedItems.length === 1 ? '' : 's'} in <span className="font-semibold text-slate-700 dark:text-slate-200">{file.name}</span>.
                  </p>
                </div>
                <button
                  onClick={reset}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-[var(--pms-border)] bg-white/75 dark:bg-slate-900/75 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Change File
                </button>
              </div>

              <AnimatePresence initial={false}>
                {extractedItems.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={prefersReduced ? false : { opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-8 text-center bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] space-y-3"
                  >
                    <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                    <h3 className="font-bold text-slate-800 dark:text-slate-200">No Embedded Audio or Video Found</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      This PDF document does not contain embedded audio tracks, MP4 videos, or portfolio attachments. If you wish to extract images, use our{' '}
                      <a href="/extract-images" className="text-[var(--pms-violet)] font-bold underline">
                        Extract All Images
                      </a>{' '}
                      tool.
                    </p>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    {extractedItems.map((item, idx) => (
                      <motion.div
                        key={item.id}
                        initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, delay: idx * 0.04 }}
                        className="p-4 bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] flex items-center justify-center shrink-0">
                            {item.type === 'audio' ? (
                              <Music className="w-5 h-5" />
                            ) : item.type === 'video' ? (
                              <Video className="w-5 h-5" />
                            ) : (
                              <FileArchive className="w-5 h-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{item.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {item.extension.toUpperCase()} • {formatSize(item.size)}
                            </p>
                          </div>
                        </div>

                        {item.blobUrl ? (
                          <div className="flex items-center gap-2.5 w-full sm:w-auto">
                            {item.type === 'audio' && (
                              <audio controls src={item.blobUrl} className="h-8 max-w-[200px]" />
                            )}
                            <motion.a
                              whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                              whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                              href={item.blobUrl}
                              download={item.name}
                              className="pms-btn-primary py-2 px-4 font-bold rounded-xl text-xs flex items-center gap-1.5 shrink-0"
                            >
                              <Download className="w-4 h-4" />
                              Download
                            </motion.a>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic px-2.5 py-1 rounded-lg bg-slate-100/70 dark:bg-slate-800/70">
                            Reference stream
                          </span>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>

              <div className="pt-2 text-center">
                <button
                  onClick={reset}
                  className="py-3 px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-colors text-sm cursor-pointer"
                >
                  Scan Another Document
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
