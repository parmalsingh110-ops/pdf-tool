export interface ReleaseHighlight {
  id: string;
  title: string;
  tag: string;
  summary: string;
  path: string;
  accent: 'rose' | 'violet' | 'blue' | 'mint';
}

export interface ReleaseNotesConfig {
  version: string;
  badgeLabel: string;
  bannerTitle: string;
  bannerSubtitle: string;
  quickTryLabel: string;
  quickTryPath: string;
  highlights: ReleaseHighlight[];
}

export const CURRENT_RELEASE_VERSION = '2.0.0';
export const RELEASE_STORAGE_KEY = 'pms_seen_release_version';

export const RELEASE_NOTES: ReleaseNotesConfig = {
  version: CURRENT_RELEASE_VERSION,
  badgeLabel: 'v2.0',
  bannerTitle: 'PDF Media Suite 2.0 Updated',
  bannerSubtitle:
    'Upgraded PDF to Word tables, Hindi/CMap repair, owner-locked Split auto-unlock & faster AI Vision.',
  quickTryLabel: 'Try PDF to Word',
  quickTryPath: '/pdf-to-word',
  highlights: [
    {
      id: 'pdf-to-word-v2',
      title: 'PDF to Word Engine 2.0',
      tag: 'Upgraded',
      summary:
        'Precision 0.5pt table cell reconstruction, Devanagari CMap repair & clean Photo/Signature isolation.',
      path: '/pdf-to-word',
      accent: 'rose',
    },
    {
      id: 'split-auto-unlock',
      title: 'Split & Owner-Locked PDFs',
      tag: 'Fixed',
      summary:
        'Admit cards, e-Call Letters & print-restricted PDFs now load and split cleanly without encryption errors.',
      path: '/split',
      accent: 'blue',
    },
    {
      id: 'unlock-helper',
      title: 'Unlock PDF Helper',
      tag: 'Enhanced',
      summary:
        'Lossless removal of owner-restriction flags with seamless local-first and backend fallback support.',
      path: '/unlock',
      accent: 'violet',
    },
    {
      id: 'advanced-editor',
      title: 'Advanced PDF Editor',
      tag: 'Upgraded',
      summary:
        'Crisp span-level text editing, whiteout-free replacement and improved multi-layer element positioning.',
      path: '/edit',
      accent: 'rose',
    },
    {
      id: 'searchable-ocr',
      title: 'Bilingual Searchable OCR',
      tag: 'AI + Local',
      summary:
        'Dual English + Devanagari OCR with invisible selectable text overlay that preserves original page visuals.',
      path: '/searchable-pdf',
      accent: 'mint',
    },
    {
      id: 'doc-forensics',
      title: 'Document Forensics Lab',
      tag: 'Pro Tool',
      summary:
        'Detect hidden whiteout layers, spliced fonts, ELA image edits and PDF signature revision breaks.',
      path: '/doc-forensics',
      accent: 'violet',
    },
  ],
};

export const V2_UPDATED_TOOL_PATHS = new Set<string>(
  RELEASE_NOTES.highlights.map((item) => item.path)
);

/**
 * Returns true if the current release announcement has already been dismissed
 * or interacted with in this browser. Defaults safely when storage is unavailable.
 */
export function hasSeenCurrentRelease(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(RELEASE_STORAGE_KEY) === RELEASE_NOTES.version;
  } catch {
    return false;
  }
}

/**
 * Persists acknowledgement for the active release version so the notification bar
 * stays hidden until a newer version ships.
 */
export function markCurrentReleaseSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RELEASE_STORAGE_KEY, RELEASE_NOTES.version);
  } catch {
    // Ignore private/restricted storage errors cleanly
  }
}
