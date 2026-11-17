import { getApiBaseUrl } from './api';

const USER_VISION_KEY_STORAGE = 'pms_user_gemini_key';
const USER_VISION_PROVIDER_STORAGE = 'pms_user_vision_provider';

export type VisionProvider = 'auto' | 'gemini' | 'claude' | 'openai';
export type DocumentLayerMode = 'clean_real' | 'layered_replica';

export interface ServerVisionStatus {
  enhanced_available?: boolean;
  server_ai_configured: boolean;
  allow_server_ai: boolean;
}

let cachedServerStatus: ServerVisionStatus | null = null;
let serverStatusPromise: Promise<ServerVisionStatus> | null = null;

/**
 * Security & Zero-Leak Rule:
 * NEVER read provider API keys in frontend JS and NEVER call third-party endpoints
 * directly from the browser. All document intelligence runs silently on the server.
 */
export const getVisionApiKey = (): string => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return (window.sessionStorage.getItem(USER_VISION_KEY_STORAGE) || '').trim();
    }
  } catch {
    // ignore storage errors
  }
  return '';
};

export const getVisionProvider = (): VisionProvider => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const p = (window.sessionStorage.getItem(USER_VISION_PROVIDER_STORAGE) || 'auto').trim().toLowerCase();
      if (p === 'gemini' || p === 'claude' || p === 'openai') return p;
    }
  } catch {
    // ignore storage errors
  }
  return 'auto';
};

export const setVisionProvider = (provider: VisionProvider): void => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(USER_VISION_PROVIDER_STORAGE, provider);
    }
  } catch {
    // ignore storage errors
  }
};

export async function fetchServerVisionStatus(forceRefresh = false): Promise<ServerVisionStatus> {
  if (!forceRefresh && cachedServerStatus) {
    return cachedServerStatus;
  }
  if (!forceRefresh && serverStatusPromise) {
    return serverStatusPromise;
  }
  const fallback: ServerVisionStatus = {
    enhanced_available: false,
    server_ai_configured: false,
    allow_server_ai: true,
  };
  serverStatusPromise = (async () => {
    try {
      const resp = await fetch(`${getApiBaseUrl()}/vision/status`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (resp.ok) {
        const data = (await resp.json()) as Partial<ServerVisionStatus>;
        const configured = Boolean(data.enhanced_available ?? data.server_ai_configured);
        cachedServerStatus = {
          enhanced_available: configured,
          server_ai_configured: configured,
          allow_server_ai: data.allow_server_ai !== false,
        };
        return cachedServerStatus;
      }
    } catch {
      // Backend offline or unreachable; fall back quietly to offline local mode
    } finally {
      serverStatusPromise = null;
    }
    return cachedServerStatus || fallback;
  })();
  return serverStatusPromise;
}

export const isVisionAiEnabled = (): boolean =>
  Boolean(cachedServerStatus?.enhanced_available ?? cachedServerStatus?.server_ai_configured) ||
  getVisionApiKey().length > 10;

export const setUserVisionApiKey = (key: string): void => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const clean = key.trim();
      if (clean) window.sessionStorage.setItem(USER_VISION_KEY_STORAGE, clean);
      else window.sessionStorage.removeItem(USER_VISION_KEY_STORAGE);
    }
  } catch {
    // ignore storage errors
  }
};

export const clearUserVisionApiKey = (): void => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(USER_VISION_KEY_STORAGE);
    }
  } catch {
    // ignore storage errors
  }
};

export function appendVisionLayerParams(
  formData: FormData,
  opts: {
    layerMode?: DocumentLayerMode;
    strictLocal?: boolean;
    aiProvider?: VisionProvider;
    lang?: string;
  }
): void {
  const strict = Boolean(opts.strictLocal);
  formData.append('strict_local', strict ? 'true' : 'false');
  if (opts.layerMode) {
    formData.append('layer_mode', opts.layerMode);
  }
  if (opts.lang) {
    formData.append('lang', opts.lang);
  }
  const prov = opts.aiProvider || getVisionProvider();
  formData.append('ai_provider', strict ? 'offline' : prov);
  // Only include optional session BYOK key when user explicitly typed one;
  // when key lives in backend/.env, NO API key ever enters browser FormData.
  if (!strict) {
    const key = getVisionApiKey();
    if (key) {
      formData.append('ai_api_key', key);
    }
  }
}

export async function sourceUrlToBase64(imageUrlOrDataUrl: string): Promise<string> {
  if (!imageUrlOrDataUrl) return '';
  if (imageUrlOrDataUrl.startsWith('data:')) return imageUrlOrDataUrl;
  const resp = await fetch(imageUrlOrDataUrl);
  const blob = await resp.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to encode image'));
    reader.readAsDataURL(blob);
  });
}

type VisionAssistTask =
  | 'document_layout'
  | 'text_regions'
  | 'table_data'
  | 'enhance_text'
  | 'polish_paragraphs'
  | 'universal_layout'
  | 'fix_text'
  | 'translate_hi_en'
  | 'shorten_text';

async function postServerVisionAssist<T>(
  task: VisionAssistTask,
  body: Record<string, unknown>
): Promise<T> {
  const sessionKey = getVisionApiKey();
  const payload: Record<string, unknown> = {
    task,
    ai_provider: getVisionProvider(),
    strict_local: false,
    ...body,
  };
  if (sessionKey) {
    payload.ai_api_key = sessionKey;
  }
  const response = await fetch(`${getApiBaseUrl()}/vision/assist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error('Document intelligence service unavailable.');
  }
  const data = await response.json();
  if (!data?.ok) {
    throw new Error('Document intelligence processing returned no result.');
  }
  return data.result as T;
}

export interface DocumentLayoutResponse {
  title_lines?: string[];
  diary_no?: string;
  notes?: string[];
  fields?: { label: string; value: string; bold_value?: boolean }[];
  passengers?: string[];
  mobile?: string;
  relation?: string;
  purpose?: string;
  reference?: string;
  signature_line?: string;
  stamp_lines?: string[];
  note_label?: string;
  note_items?: string[];
}

export async function extractDocumentLayout(base64Image: string): Promise<DocumentLayoutResponse> {
  return postServerVisionAssist<DocumentLayoutResponse>('document_layout', { image_b64: base64Image });
}

export async function extractTextRegions(base64Image: string): Promise<any> {
  return postServerVisionAssist<any[]>('text_regions', { image_b64: base64Image });
}

export async function extractTableData(base64Image: string): Promise<string[][]> {
  return postServerVisionAssist<string[][]>('table_data', { image_b64: base64Image });
}

export async function enhanceTextWithAI(rawText: string): Promise<string[]> {
  if (!rawText.trim()) return [];
  try {
    const res = await postServerVisionAssist<string[]>('enhance_text', { text: rawText });
    if (Array.isArray(res) && res.length > 0) return res.map(String);
  } catch {
    // Graceful local fallback
  }
  return rawText.split('\n').filter(Boolean);
}

export async function polishExtractedParagraphs(paras: string[]): Promise<string[]> {
  if (!paras.length) return paras;
  try {
    const res = await postServerVisionAssist<string[]>('polish_paragraphs', { paras });
    if (Array.isArray(res) && res.length === paras.length) {
      return res.map(String);
    }
  } catch {
    // Graceful local fallback
  }
  return paras;
}

export interface UniversalLayoutElement {
  type: 'text' | 'image' | 'table';
  text?: string;
  font_size?: number;
  bold?: boolean;
  italic?: boolean;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  description?: string;
  bbox: [number, number, number, number];
  rows?: any[][];
  has_borders?: boolean;
}

export interface UniversalLayoutResponse {
  page_width: number;
  page_height: number;
  elements: UniversalLayoutElement[];
}

export async function extractUniversalLayout(base64Image: string): Promise<UniversalLayoutResponse> {
  return postServerVisionAssist<UniversalLayoutResponse>('universal_layout', { image_b64: base64Image });
}

export interface TextMicroActionResult {
  text: string;
  changed: boolean;
}

export async function fixTextWithAI(rawText: string, imageB64 = ''): Promise<TextMicroActionResult> {
  if (!rawText.trim()) return { text: rawText, changed: false };
  try {
    const res = await postServerVisionAssist<TextMicroActionResult>('fix_text', {
      text: rawText,
      ...(imageB64 ? { image_b64: imageB64 } : {}),
    });
    if (res && typeof res.text === 'string' && res.text.trim()) {
      return { text: res.text, changed: Boolean(res.changed) };
    }
  } catch {
    // Graceful local fallback
  }
  return { text: rawText.replace(/\s+/g, ' ').trim(), changed: false };
}

export async function translateTextWithAI(rawText: string): Promise<TextMicroActionResult> {
  if (!rawText.trim()) return { text: rawText, changed: false };
  try {
    const res = await postServerVisionAssist<TextMicroActionResult>('translate_hi_en', { text: rawText });
    if (res && typeof res.text === 'string' && res.text.trim()) {
      return { text: res.text, changed: Boolean(res.changed) };
    }
  } catch {
    // Graceful unchanged fallback
  }
  return { text: rawText, changed: false };
}

export async function shortenTextWithAI(rawText: string, maxChars = 0): Promise<TextMicroActionResult> {
  if (!rawText.trim()) return { text: rawText, changed: false };
  try {
    const res = await postServerVisionAssist<TextMicroActionResult>('shorten_text', {
      text: rawText,
      max_chars: maxChars,
    });
    if (res && typeof res.text === 'string' && res.text.trim()) {
      return { text: res.text, changed: Boolean(res.changed) };
    }
  } catch {
    // Graceful unchanged fallback
  }
  return { text: rawText, changed: false };
}
