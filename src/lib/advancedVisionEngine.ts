export const getVisionApiKey = () => import.meta.env.VITE_GEMINI_API_KEY || '';

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash-8b'
];

export async function fetchGeminiWithFallback(apiKey: string, requestBody: any): Promise<Response> {
  let lastStatus = 0;
  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        }
      );
      if (response.ok) return response;
      
      lastStatus = response.status;
      // 429 = Rate Limit, 503 = Service Unavailable, 500 = Internal Error
      if (response.status === 429 || response.status >= 500) {
        console.warn(`Gemini model ${model} hit limit/error (${response.status}). Waiting 1.5s before fallback...`);
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      // For other errors (like 400 bad request, 403 invalid key) we might not want to loop all 5 models,
      // but to be safe and handle API quirks, we'll try the next model without delay.
      console.warn(`Gemini model ${model} returned ${response.status}. Trying next...`);
    } catch (e) {
      console.warn(`Gemini fetch error on ${model}:`, e);
    }
  }
  throw new Error(`All Gemini models failed. Last status: ${lastStatus}`);
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
  const apiKey = getVisionApiKey();
  if (!apiKey) throw new Error('Vision API key is not configured.');

  const prompt = `You are an expert document formatter. Your job is to analyze a document image and recreate it as a perfectly formatted Word document.

RULES:
1. Extract ALL text exactly as it appears — preserve capitalization, bold, spacing
2. Identify layout: centered titles, left-aligned labels, right-aligned content
3. Return ONLY valid JSON — no markdown, no explanation, no backticks

Return this exact JSON structure:
{
  "title_lines": ["LINE1", "LINE2"],
  "diary_no": "value",
  "notes": ["(a) full text", "(b) full text"],
  "fields": [
    { "label": "TRAIN NO: -", "value": "12941", "bold_value": true }
  ],
  "passengers": ["1) NAME (F-25 Years)", "2) NAME (M-50 Years)"],
  "mobile": "value",
  "relation": "value", 
  "purpose": "value",
  "reference": "value",
  "signature_line": "SIGNATURE & STAMP OF GAZETTED OFFICER: -",
  "stamp_lines": ["stamp line 1", "line 2"],
  "note_label": "NOTE: -",
  "note_items": ["1. text", "2. text"]
}`;

  const base64Data = base64Image.split(',')[1] || base64Image;

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: "image/jpeg", data: base64Data } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: "application/json",
    }
  };

  const response = await fetchGeminiWithFallback(apiKey, requestBody);

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Vision Engine call failed');
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  try {
    return JSON.parse(rawText.replace(/\`\`\`json|\`\`\`/g, '').trim());
  } catch (e) {
    throw new Error('Failed to parse Vision JSON response');
  }
}

export async function extractTextRegions(base64Image: string): Promise<any> {
  const apiKey = getVisionApiKey();
  if (!apiKey) throw new Error('Vision API key is not configured.');

  const prompt = `Perform highly accurate OCR on this document fragment.
If it contains Hindi/Devanagari, ensure proper Unicode rendering.
Return ONLY a valid JSON array of objects, where each object represents a logical line or block of text with its bounding box:
[
  { 
    "text": "Extracted text here",
    "box_2d": [ymin, xmin, ymax, xmax] // normalized to 0-1000
  }
]
No markdown or explanations.`;

  const base64Data = base64Image.split(',')[1] || base64Image;

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: "image/jpeg", data: base64Data } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: "application/json",
    }
  };

  const response = await fetchGeminiWithFallback(apiKey, requestBody);
  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

  try {
    return JSON.parse(rawText.replace(/\`\`\`json|\`\`\`/g, '').trim());
  } catch (e) {
    throw new Error('Failed to parse Vision JSON response');
  }
}

export async function extractTableData(base64Image: string): Promise<string[][]> {
  const apiKey = getVisionApiKey();
  if (!apiKey) throw new Error('Vision API key is not configured.');

  const prompt = `Extract all tabular data from this document.
Return ONLY a valid JSON array of arrays representing the rows and columns.
Example: [["Header 1", "Header 2"], ["Value 1", "Value 2"]]
No markdown or explanations.`;

  const base64Data = base64Image.split(',')[1] || base64Image;

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: "image/jpeg", data: base64Data } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: "application/json",
    }
  };

  const response = await fetchGeminiWithFallback(apiKey, requestBody);

  if (!response.ok) throw new Error('Vision Engine call failed');

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

  try {
    return JSON.parse(rawText.replace(/\`\`\`json|\`\`\`/g, '').trim());
  } catch (e) {
    throw new Error('Failed to parse Vision JSON response');
  }
}

/**
 * enhanceTextWithAI — Takes raw extracted text (from DOCX, etc.) and asks
 * Gemini to clean it up, fix encoding, and structure it into clean paragraphs.
 * Returns array of clean paragraph strings. Falls back to splitting by newlines.
 */
export async function enhanceTextWithAI(rawText: string): Promise<string[]> {
  const apiKey = getVisionApiKey();
  if (!apiKey || !rawText.trim()) return rawText.split('\n').filter(Boolean);

  const prompt = `You are a document text cleaner. I extracted the following raw text from a document.
Please clean it up: fix encoding issues, remove duplicate spaces, properly separate paragraphs.
Return ONLY a valid JSON array of clean paragraph strings. No markdown, no explanation.
Example: ["Paragraph 1 text.", "Paragraph 2 text."]

Raw text:
${rawText.slice(0, 8000)}`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1 }
  };

  try {
    const response = await fetchGeminiWithFallback(apiKey, requestBody);
    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(String);
  } catch { /* fallback */ }

  return rawText.split('\n').filter(Boolean);
}
