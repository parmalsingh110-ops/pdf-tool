import { useEffect, useRef, useState, useCallback } from 'react';
import { FileCode, Download, Copy, Check, Upload, Trash2, RefreshCw } from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// ─── Language registry ───────────────────────────────────────────────
const LANGUAGES = [
  { id: 'auto',  label: 'Auto Detect' },
  { id: 'html',  label: 'HTML' },
  { id: 'css',   label: 'CSS' },
  { id: 'js',    label: 'JavaScript' },
  { id: 'ts',    label: 'TypeScript' },
  { id: 'jsx',   label: 'JSX / TSX' },
  { id: 'py',    label: 'Python' },
  { id: 'java',  label: 'Java' },
  { id: 'c',     label: 'C / C++' },
  { id: 'cs',    label: 'C#' },
  { id: 'php',   label: 'PHP' },
  { id: 'rb',    label: 'Ruby' },
  { id: 'go',    label: 'Go' },
  { id: 'rs',    label: 'Rust' },
  { id: 'sql',   label: 'SQL' },
  { id: 'json',  label: 'JSON' },
  { id: 'xml',   label: 'XML' },
  { id: 'yaml',  label: 'YAML' },
  { id: 'sh',    label: 'Bash / Shell' },
  { id: 'txt',   label: 'Plain Text' },
];

const EXT_TO_LANG: Record<string, string> = {
  html: 'html', htm: 'html', css: 'css',
  js: 'js', mjs: 'js', cjs: 'js',
  jsx: 'jsx', ts: 'ts', tsx: 'jsx',
  py: 'py', pyw: 'py',
  java: 'java', c: 'c', cpp: 'c', cc: 'c', h: 'c', hpp: 'c',
  cs: 'cs', php: 'php', rb: 'rb', go: 'go', rs: 'rs',
  sql: 'sql', json: 'json', xml: 'xml', svg: 'xml',
  yaml: 'yaml', yml: 'yaml',
  sh: 'sh', bash: 'sh', zsh: 'sh',
  txt: 'txt', md: 'txt', markdown: 'txt',
};

// ─── Token types & colors ────────────────────────────────────────────
type TokType = 'kw' | 'str' | 'cmt' | 'num' | 'tag' | 'attr' | 'op' | 'txt';

// Colors: [r, g, b] in 0–1 range for pdf-lib
const PDF_COLORS: Record<TokType, [number, number, number]> = {
  kw:  [0.10, 0.30, 0.82],
  str: [0.08, 0.58, 0.18],
  cmt: [0.50, 0.53, 0.48],
  num: [0.80, 0.40, 0.05],
  tag: [0.70, 0.10, 0.10],
  attr:[0.08, 0.50, 0.68],
  op:  [0.38, 0.08, 0.52],
  txt: [0.09, 0.09, 0.09],
};

// CSS preview colors (Tailwind-compatible inline styles)
const CSS_COLORS: Record<TokType, string> = {
  kw:  '#1a4dd4',
  str: '#147a27',
  cmt: '#6e7868',
  num: '#b35a0a',
  tag: '#b01a1a',
  attr:'#0d78aa',
  op:  '#5e0f80',
  txt: '#1a1a1a',
};

// ─── Keywords per language ────────────────────────────────────────────
const KW: Record<string, string[]> = {
  js:   ['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','class','import','export','default','new','this','typeof','instanceof','null','undefined','true','false','async','await','try','catch','throw','finally','from','of','in','delete','void','yield','static','get','set','extends','super','debugger'],
  ts:   ['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','class','import','export','default','new','this','typeof','instanceof','null','undefined','true','false','async','await','try','catch','throw','finally','from','of','in','delete','void','yield','static','get','set','extends','super','interface','type','enum','implements','public','private','protected','readonly','namespace','declare','abstract','as','keyof','infer','never','unknown','any'],
  jsx:  ['const','let','var','function','return','if','else','for','while','class','import','export','default','new','this','true','false','async','await','from','try','catch','throw','null','undefined','extends','super'],
  py:   ['def','class','import','from','return','if','elif','else','for','while','in','not','and','or','True','False','None','try','except','finally','raise','with','as','pass','break','continue','global','nonlocal','lambda','yield','del','assert','is','print','len','range','type','self','super'],
  java: ['public','private','protected','class','interface','extends','implements','static','final','abstract','new','return','if','else','for','while','do','switch','case','break','continue','void','null','this','super','import','package','try','catch','finally','throw','throws','instanceof','true','false','int','long','double','float','boolean','char','byte','short','String','System'],
  c:    ['int','long','double','float','char','void','return','if','else','for','while','do','switch','case','break','continue','struct','typedef','include','define','const','static','unsigned','signed','NULL','true','false','auto','extern','volatile','enum','union','sizeof','printf','scanf'],
  cs:   ['public','private','protected','class','interface','static','new','return','if','else','for','while','do','switch','case','break','continue','void','null','this','base','using','namespace','try','catch','finally','throw','true','false','string','int','long','double','float','bool','var','async','await','readonly','const','abstract','override','virtual','sealed','delegate','event'],
  php:  ['echo','print','function','return','if','else','elseif','for','while','foreach','switch','case','break','continue','class','interface','extends','implements','new','null','true','false','public','private','protected','static','abstract','final','require','include','use','namespace','try','catch','throw','$this'],
  rb:   ['def','class','module','return','if','elsif','else','unless','for','while','do','end','nil','true','false','and','or','not','require','include','attr_accessor','begin','rescue','ensure','raise','yield','puts','print','self','super'],
  go:   ['func','return','if','else','for','range','switch','case','break','continue','var','const','type','struct','interface','package','import','go','chan','select','defer','map','nil','true','false','int','string','bool','error','make','new','len','append','delete'],
  rs:   ['fn','let','mut','const','return','if','else','for','while','loop','match','use','mod','pub','struct','enum','impl','trait','type','where','async','await','unsafe','extern','crate','self','Self','true','false','Some','None','Ok','Err','Vec','String'],
  sql:  ['SELECT','FROM','WHERE','JOIN','LEFT','RIGHT','INNER','OUTER','ON','GROUP','ORDER','BY','HAVING','LIMIT','OFFSET','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','INDEX','VIEW','DROP','ALTER','ADD','COLUMN','PRIMARY','KEY','FOREIGN','REFERENCES','NOT','NULL','UNIQUE','DEFAULT','AS','AND','OR','IN','LIKE','BETWEEN','EXISTS','DISTINCT','COUNT','SUM','AVG','MAX','MIN','UNION','ALL','CASE','WHEN','THEN','END','WITH'],
  sh:   ['if','then','else','elif','fi','for','while','do','done','case','esac','function','return','echo','exit','export','local','readonly','source','set','unset','alias','cd','ls','mkdir','rm','cp','mv','grep','sed','awk','cat','find','chmod','sudo','git','npm','pip','true','false'],
  html: [],
  css:  [],
  json: ['true','false','null'],
  xml:  [],
  yaml: ['true','false','null','yes','no','on','off'],
  txt:  [],
};

interface Tok { type: TokType; val: string; }

// ─── Tokenizer ───────────────────────────────────────────────────────

function tokenizeLine(line: string, lang: string): Tok[] {
  if (!line) return [{ type: 'txt', val: '' }];

  if (lang === 'html' || lang === 'xml' || lang === 'svg') return tokenizeHtml(line);
  if (lang === 'css') return tokenizeCss(line);
  if (lang === 'json') return tokenizeJson(line);

  const tokens: Tok[] = [];
  const kwSet = new Set((KW[lang] ?? []).map(k => k.toLowerCase()));
  let i = 0;

  while (i < line.length) {
    // Single-line comments: // # -- REM
    if (
      (line[i] === '/' && line[i + 1] === '/') ||
      (lang === 'py' && line[i] === '#') ||
      (lang === 'rb' && line[i] === '#') ||
      (lang === 'sh' && line[i] === '#') ||
      (lang === 'yaml' && line[i] === '#') ||
      (lang === 'sql' && line[i] === '-' && line[i + 1] === '-')
    ) {
      tokens.push({ type: 'cmt', val: line.slice(i) });
      break;
    }
    // Block comment start /*
    if (line[i] === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2);
      if (end !== -1) {
        tokens.push({ type: 'cmt', val: line.slice(i, end + 2) });
        i = end + 2;
      } else {
        tokens.push({ type: 'cmt', val: line.slice(i) });
        break;
      }
      continue;
    }
    // Strings: " ' `
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const q = line[i];
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === '\\') { j += 2; continue; }
        if (line[j] === q) { j++; break; }
        j++;
      }
      tokens.push({ type: 'str', val: line.slice(i, j) });
      i = j;
      continue;
    }
    // Numbers
    if (/[0-9]/.test(line[i]) && (i === 0 || /[\s,;(=\[{+\-*/<>!&|^%?:@]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[0-9a-fA-Fx._]/.test(line[j])) j++;
      tokens.push({ type: 'num', val: line.slice(i, j) });
      i = j;
      continue;
    }
    // Identifiers / keywords
    if (/[a-zA-Z_$@]/.test(line[i])) {
      let j = i + 1;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      tokens.push({ type: kwSet.has(word.toLowerCase()) ? 'kw' : 'txt', val: word });
      i = j;
      continue;
    }
    // Operators
    if (/[{}()\[\]=<>+\-*\/!&|^%?:;,~.]/.test(line[i])) {
      tokens.push({ type: 'op', val: line[i] });
      i++;
      continue;
    }
    // Whitespace / other
    let j = i + 1;
    while (j < line.length && line[j] === line[i]) j++;
    tokens.push({ type: 'txt', val: line.slice(i, j) });
    i = j;
  }
  return tokens;
}

function tokenizeHtml(line: string): Tok[] {
  const tokens: Tok[] = [];
  // HTML comment
  if (line.trim().startsWith('<!--')) {
    const end = line.indexOf('-->');
    if (end !== -1) {
      tokens.push({ type: 'cmt', val: line.slice(0, end + 3) });
      if (end + 3 < line.length) tokens.push({ type: 'txt', val: line.slice(end + 3) });
    } else {
      tokens.push({ type: 'cmt', val: line });
    }
    return tokens;
  }
  let i = 0;
  while (i < line.length) {
    if (line[i] === '<') {
      let j = i + 1;
      const isClose = line[j] === '/';
      if (isClose) j++;
      const tagStart = j;
      while (j < line.length && /[a-zA-Z0-9\-:]/.test(line[j])) j++;
      const tagName = line.slice(tagStart, j);
      tokens.push({ type: 'op', val: line.slice(i, i + 1 + (isClose ? 1 : 0)) });
      if (tagName) tokens.push({ type: 'tag', val: tagName });
      i = j;
      while (i < line.length && line[i] !== '>') {
        if (/[a-zA-Z\-]/.test(line[i])) {
          let k = i + 1;
          while (k < line.length && /[a-zA-Z0-9\-:]/.test(line[k])) k++;
          tokens.push({ type: 'attr', val: line.slice(i, k) });
          i = k;
        } else if (line[i] === '"' || line[i] === "'") {
          const q = line[i];
          let k = i + 1;
          while (k < line.length && line[k] !== q) k++;
          tokens.push({ type: 'str', val: line.slice(i, k + 1) });
          i = k + 1;
        } else {
          tokens.push({ type: 'op', val: line[i] });
          i++;
        }
      }
      if (i < line.length) { tokens.push({ type: 'op', val: '>' }); i++; }
    } else {
      let j = i + 1;
      while (j < line.length && line[j] !== '<') j++;
      tokens.push({ type: 'txt', val: line.slice(i, j) });
      i = j;
    }
  }
  return tokens;
}

function tokenizeCss(line: string): Tok[] {
  const tokens: Tok[] = [];
  const trimmed = line.trim();
  if (trimmed.startsWith('/*') || trimmed.startsWith('//')) {
    tokens.push({ type: 'cmt', val: line });
    return tokens;
  }
  const colonIdx = line.indexOf(':');
  const braceIdx = line.search(/[{}]/);
  if (braceIdx !== -1 && (colonIdx === -1 || braceIdx < colonIdx)) {
    const before = line.slice(0, braceIdx);
    if (before.trim()) tokens.push({ type: 'attr', val: before });
    tokens.push({ type: 'op', val: line[braceIdx] });
    const after = line.slice(braceIdx + 1);
    if (after.trim()) tokens.push({ type: 'txt', val: after });
  } else if (colonIdx !== -1) {
    tokens.push({ type: 'kw', val: line.slice(0, colonIdx) });
    tokens.push({ type: 'op', val: ':' });
    tokens.push({ type: 'str', val: line.slice(colonIdx + 1) });
  } else {
    tokens.push({ type: 'txt', val: line });
  }
  return tokens;
}

function tokenizeJson(line: string): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;
  const kwSet = new Set(['true', 'false', 'null']);
  while (i < line.length) {
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === '\\') { j += 2; continue; }
        if (line[j] === '"') { j++; break; }
        j++;
      }
      // Determine if it's a key (followed by colon)
      let k = j;
      while (k < line.length && line[k] === ' ') k++;
      const type: TokType = line[k] === ':' ? 'attr' : 'str';
      tokens.push({ type, val: line.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9\-]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[0-9.\-e]/.test(line[j])) j++;
      tokens.push({ type: 'num', val: line.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(line[i])) {
      let j = i + 1;
      while (j < line.length && /[a-zA-Z]/.test(line[j])) j++;
      const w = line.slice(i, j);
      tokens.push({ type: kwSet.has(w) ? 'kw' : 'txt', val: w });
      i = j;
      continue;
    }
    if (/[{}[\]:,]/.test(line[i])) {
      tokens.push({ type: 'op', val: line[i] });
      i++;
      continue;
    }
    tokens.push({ type: 'txt', val: line[i] });
    i++;
  }
  return tokens;
}

// ─── PDF generator ────────────────────────────────────────────────────

function sanitizeForPdf(s: string): string {
  // Replace characters outside the printable ASCII + common range
  return s.replace(/[^\x09\x20-\x7E]/g, '?');
}

async function generateCodePdf(
  code: string,
  filename: string,
  lang: string,
  showLineNumbers: boolean,
  fontSize: number,
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const mono     = await pdfDoc.embedFont(StandardFonts.Courier);
  const monoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);
  const helv     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595, PAGE_H = 842;
  const ML = 44, MR = 28, MT = 30, MB = 30;
  const HEADER_H = 30;
  const FOOTER_H = 18;
  const TOP_Y  = PAGE_H - MT - HEADER_H - 8;  // first line y
  const BOT_Y  = MB + FOOTER_H;               // last allowed y

  const charW = mono.widthOfTextAtSize('M', fontSize);
  const lineH = Math.ceil(fontSize * 1.55);

  const lineNumCols = 5;
  const lineNumW = showLineNumbers ? charW * lineNumCols + 6 : 0;
  const codeW    = PAGE_W - ML - MR - lineNumW;
  const maxChars = Math.max(1, Math.floor(codeW / charW));

  const rawLines = code.split('\n');
  const totalSourceLines = rawLines.length;

  // Expand tabs
  const lines = rawLines.map(l => l.replace(/\t/g, '    '));

  // Word-wrap long lines
  type RendLine = { srcIdx: number; text: string; continued: boolean };
  const rendLines: RendLine[] = [];
  lines.forEach((line, li) => {
    if (line.length <= maxChars) {
      rendLines.push({ srcIdx: li + 1, text: line, continued: false });
    } else {
      let pos = 0, first = true;
      while (pos < line.length) {
        rendLines.push({ srcIdx: li + 1, text: line.slice(pos, pos + maxChars), continued: !first });
        pos += maxChars;
        first = false;
      }
    }
  });

  const linesPerPage = Math.max(1, Math.floor((TOP_Y - BOT_Y) / lineH));
  const totalPages   = Math.max(1, Math.ceil(rendLines.length / linesPerPage));

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let pageNum = 1;

  const langLabel = (LANGUAGES.find(l => l.id === lang)?.label ?? lang).toUpperCase();
  const displayName = filename.length > 58 ? '…' + filename.slice(-55) : filename;

  const drawHeader = (pg: any, pn: number) => {
    pg.drawRectangle({
      x: 0, y: PAGE_H - MT - HEADER_H,
      width: PAGE_W, height: HEADER_H,
      color: rgb(0.13, 0.17, 0.30),
    });
    // Lang badge
    pg.drawRectangle({
      x: PAGE_W - MR - 48, y: PAGE_H - MT - HEADER_H + 5,
      width: 46, height: 18,
      color: rgb(0.20, 0.55, 0.32),
    });
    try { pg.drawText(langLabel.slice(0, 8), { x: PAGE_W - MR - 45, y: PAGE_H - MT - HEADER_H + 11, size: 7.5, font: helvBold, color: rgb(1, 1, 1) }); } catch { /* */ }
    try { pg.drawText(displayName, { x: ML, y: PAGE_H - MT - HEADER_H + 11, size: 8.5, font: monoBold, color: rgb(0.88, 0.90, 1) }); } catch { /* */ }
    try { pg.drawText(`${pn} / ${totalPages}`, { x: ML, y: PAGE_H - MT - HEADER_H + 2, size: 7, font: helv, color: rgb(0.60, 0.65, 0.80) }); } catch { /* */ }
  };

  const drawFooter = (pg: any) => {
    pg.drawLine({
      start: { x: ML, y: MB + FOOTER_H },
      end:   { x: PAGE_W - MR, y: MB + FOOTER_H },
      thickness: 0.3, color: rgb(0.72, 0.72, 0.82),
    });
    try { pg.drawText('PDF Media Suite · pdfmediasuite.in', { x: ML, y: MB + 5, size: 6.5, font: helv, color: rgb(0.52, 0.52, 0.62) }); } catch { /* */ }
    try { pg.drawText(`${totalSourceLines} lines  ·  ${code.length.toLocaleString()} chars`, { x: PAGE_W - MR - 130, y: MB + 5, size: 6.5, font: helv, color: rgb(0.52, 0.52, 0.62) }); } catch { /* */ }
  };

  const drawCodeBg = (pg: any) => {
    pg.drawRectangle({
      x: ML - 4, y: BOT_Y,
      width: PAGE_W - ML - MR + 4, height: TOP_Y - BOT_Y + lineH,
      color: rgb(0.965, 0.965, 0.980),
    });
  };

  drawHeader(page, pageNum);
  drawFooter(page);
  drawCodeBg(page);

  let y = TOP_Y;

  for (let i = 0; i < rendLines.length; i++) {
    const { srcIdx, text, continued } = rendLines[i];

    // New page
    if (y - lineH < BOT_Y) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      pageNum++;
      drawHeader(page, pageNum);
      drawFooter(page);
      drawCodeBg(page);
      y = TOP_Y;
    }

    // Alternate row background
    if (i % 2 === 0) {
      page.drawRectangle({
        x: ML - 4, y: y - lineH * 0.38,
        width: PAGE_W - ML - MR + 4, height: lineH,
        color: rgb(0.935, 0.935, 0.952),
      });
    }

    // Line number column
    if (showLineNumbers) {
      if (!continued) {
        const ln = String(srcIdx).padStart(4, ' ');
        try {
          page.drawText(sanitizeForPdf(ln), {
            x: ML, y, size: fontSize * 0.88,
            font: mono, color: rgb(0.54, 0.54, 0.66),
          });
        } catch { /* */ }
      }
      page.drawLine({
        start: { x: ML + lineNumW - 3, y: y + fontSize * 0.85 },
        end:   { x: ML + lineNumW - 3, y: y - lineH * 0.4 },
        thickness: 0.35, color: rgb(0.72, 0.72, 0.82),
      });
    }

    // Syntax-highlighted tokens
    const tokens = tokenizeLine(text, lang);
    let x = ML + lineNumW;

    for (const tok of tokens) {
      if (!tok.val) continue;
      const safe = sanitizeForPdf(tok.val);
      if (!safe) { x += tok.val.length * charW; continue; }
      const [r, g, b] = PDF_COLORS[tok.type];
      const isBold = tok.type === 'kw';
      try {
        page.drawText(safe, {
          x, y, size: fontSize,
          font: isBold ? monoBold : mono,
          color: rgb(r, g, b),
        });
      } catch { /* skip non-renderable tokens */ }
      x += safe.length * charW;
    }

    y -= lineH;
  }

  return new Blob([await pdfDoc.save()], { type: 'application/pdf' });
}

// ─── React component ─────────────────────────────────────────────────

// Sensible limits so we don't melt the browser.
const MAX_CODE_CHARS = 2_000_000; // ~2 MB
const MAX_FILE_BYTES =  10 * 1024 * 1024; // 10 MB source file

export default function CodeToPdf() {
  const [code, setCode]             = useState('');
  const [filename, setFilename]     = useState('untitled');
  const [langId, setLangId]         = useState('auto');
  const [showLineNums, setShowLineNums] = useState(true);
  const [fontSize, setFontSize]     = useState(9);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfUrl, setPdfUrl]         = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const lastUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const jobIdRef   = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (lastUrlRef.current) {
        try { URL.revokeObjectURL(lastUrlRef.current); } catch { /* */ }
        lastUrlRef.current = null;
      }
    };
  }, []);

  const setPdfUrlSafe = (next: string | null) => {
    if (lastUrlRef.current && lastUrlRef.current !== next) {
      try { URL.revokeObjectURL(lastUrlRef.current); } catch { /* */ }
    }
    lastUrlRef.current = next;
    setPdfUrl(next);
  };

  const detectedLang = useCallback((): string => {
    if (langId !== 'auto') return langId;
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    return EXT_TO_LANG[ext] ?? 'txt';
  }, [langId, filename]);

  const lang = detectedLang();
  const langLabel = LANGUAGES.find(l => l.id === lang)?.label ?? lang;

  const loadFromFile = (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setError(`File is too large (max ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB). Try a smaller code file.`);
      return;
    }
    setFilename(file.name);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (EXT_TO_LANG[ext]) setLangId(EXT_TO_LANG[ext]);
    const reader = new FileReader();
    reader.onload = ev => {
      if (!mountedRef.current) return;
      let text = (ev.target?.result as string) ?? '';
      if (text.length > MAX_CODE_CHARS) {
        text = text.slice(0, MAX_CODE_CHARS);
        setError(`File was truncated to ${(MAX_CODE_CHARS / 1024 / 1024).toFixed(1)} MB to keep the browser responsive.`);
      } else {
        setError(null);
      }
      setCode(text);
      setPdfUrlSafe(null);
    };
    reader.onerror = () => {
      if (!mountedRef.current) return;
      setError('Could not read the file. It may be binary or corrupted.');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFromFile(file);
    e.target.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadFromFile(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConvert = async () => {
    if (!code.trim()) { setError('Please paste or upload code first.'); return; }
    if (code.length > MAX_CODE_CHARS) {
      setError(`Code is too large (max ${(MAX_CODE_CHARS / 1024 / 1024).toFixed(1)} MB).`);
      return;
    }
    const myJobId = ++jobIdRef.current;
    setIsGenerating(true);
    setError(null);
    setPdfUrlSafe(null);
    try {
      const blob = await generateCodePdf(code, filename, lang, showLineNums, fontSize);
      if (!mountedRef.current || jobIdRef.current !== myJobId) return;
      setPdfUrlSafe(URL.createObjectURL(blob));
    } catch (e: any) {
      if (!mountedRef.current || jobIdRef.current !== myJobId) return;
      console.error('[CodeToPdf]', e);
      setError(e?.message ?? 'PDF generation failed.');
    } finally {
      if (!mountedRef.current || jobIdRef.current !== myJobId) return;
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const lineCount = code ? code.split('\n').length : 0;
  const charCount = code.length;

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 md:p-8 max-w-7xl mx-auto w-full">
      {/* Page header */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 rounded-full text-xs font-bold uppercase tracking-wider">
          <FileCode className="w-3.5 h-3.5" />
          Code to PDF
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
          Code / HTML to PDF
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm max-w-2xl">
          Paste your code or upload a file — generates a beautiful syntax-highlighted PDF with line numbers. Supports 18 languages. Text is selectable &amp; copyable in the PDF.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 flex-1 min-h-0">

        {/* ─── Left panel: editor + options ─────────────────────────── */}
        <div className="flex flex-col gap-4 lg:w-[55%]">

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
            {/* Language */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">Language</label>
              <select
                value={langId}
                onChange={e => setLangId(e.target.value)}
                className="text-sm px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-300"
              >
                {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
            {/* Font size */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Font</label>
              <select
                value={fontSize}
                onChange={e => setFontSize(Number(e.target.value))}
                className="text-sm px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
              >
                <option value={7}>7pt (tiny)</option>
                <option value={8}>8pt (small)</option>
                <option value={9}>9pt (default)</option>
                <option value={10}>10pt</option>
                <option value={11}>11pt (large)</option>
              </select>
            </div>
            {/* Line numbers */}
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showLineNums}
                onChange={e => setShowLineNums(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Line numbers</span>
            </label>
            {/* Upload file */}
            <button
              onClick={() => fileRef.current?.click()}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload File
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload}
              accept=".html,.htm,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.php,.rb,.go,.rs,.sql,.json,.xml,.yaml,.yml,.sh,.bash,.txt,.md" />
          </div>

          {/* Filename input */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Filename:</label>
            <input
              type="text"
              value={filename}
              onChange={e => setFilename(e.target.value)}
              placeholder="e.g. index.html"
              className="flex-1 text-sm px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>

          {/* Code editor area */}
          <div
            className="relative flex-1 min-h-[320px] rounded-xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            {!code && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-400 dark:text-slate-500 z-10 gap-2">
                <FileCode className="w-10 h-10 opacity-40" />
                <p className="text-sm font-medium">Paste code here or drag &amp; drop a file</p>
                <p className="text-xs opacity-70">HTML · JS · TS · Python · Java · CSS · SQL · JSON and more</p>
              </div>
            )}
            <textarea
              value={code}
              onChange={e => {
                const v = e.target.value;
                if (v.length > MAX_CODE_CHARS) {
                  setError(`Maximum ${(MAX_CODE_CHARS / 1024 / 1024).toFixed(1)} MB of code allowed.`);
                  return;
                }
                if (error && v.length <= MAX_CODE_CHARS) setError(null);
                setCode(v);
                setPdfUrlSafe(null);
              }}
              spellCheck={false}
              className="w-full h-full min-h-[320px] p-4 font-mono text-sm bg-slate-950 dark:bg-slate-950 text-slate-100 resize-none outline-none leading-relaxed"
              placeholder=""
              style={{ fontFamily: "'Courier New', Courier, monospace", tabSize: 4 }}
            />
          </div>

          {/* Stats + actions */}
          <div className="flex items-center gap-3 flex-wrap">
            {code && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {lineCount.toLocaleString()} lines · {charCount.toLocaleString()} chars · <span className="font-semibold text-violet-600 dark:text-violet-400">{langLabel}</span>
              </span>
            )}
            <div className="ml-auto flex gap-2">
              {code && (
                <>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy Code'}
                  </button>
                  <button
                    onClick={() => { setCode(''); setPdfUrlSafe(null); setError(null); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ─── Right panel: preview + convert ───────────────────────── */}
        <div className="flex flex-col gap-4 lg:w-[45%]">

          {/* Preview block */}
          <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="ml-2 text-xs font-mono font-semibold text-slate-500 dark:text-slate-400">{filename}</span>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">{langLabel}</span>
            </div>
            <div className="flex-1 overflow-auto p-3" style={{ minHeight: '280px', backgroundColor: '#0f1117' }}>
              {code ? (
                <pre
                  className="text-xs leading-relaxed font-mono"
                  style={{ fontFamily: "'Courier New', Courier, monospace" }}
                >
                  {code.split('\n').map((line, li) => {
                    const tokens = tokenizeLine(line, lang);
                    return (
                      <div key={li} style={{ display: 'flex', minHeight: '1.45em' }}>
                        {showLineNums && (
                          <span style={{
                            display: 'inline-block', minWidth: '2.8em', paddingRight: '0.5em',
                            marginRight: '0.5em', borderRight: '1px solid #333',
                            color: '#555', textAlign: 'right', userSelect: 'none', flexShrink: 0,
                          }}>
                            {li + 1}
                          </span>
                        )}
                        <span>
                          {tokens.map((tok, ti) => (
                            <span key={ti} style={{ color: CSS_COLORS[tok.type] }}>
                              {tok.val}
                            </span>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                </pre>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-xs text-slate-600 dark:text-slate-500 text-center">
                    PDF preview will show here after conversion.<br />
                    Paste code in the editor on the left to start.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Convert section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Generate PDF</h3>
            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <div className="flex gap-2"><span className="text-emerald-500">✓</span> Syntax highlighting (18 languages)</div>
              <div className="flex gap-2"><span className="text-emerald-500">✓</span> Line numbers &amp; page header</div>
              <div className="flex gap-2"><span className="text-emerald-500">✓</span> Text fully selectable &amp; copyable from PDF</div>
              <div className="flex gap-2"><span className="text-emerald-500">✓</span> Monospace Courier font, alternate row shading</div>
              <div className="flex gap-2"><span className="text-emerald-500">✓</span> Runs 100% in your browser — files never uploaded</div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-xs">{error}</div>
            )}

            <button
              onClick={handleConvert}
              disabled={isGenerating || !code.trim()}
              className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isGenerating
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating PDF…</>
                : <><FileCode className="w-4 h-4" /> Convert to PDF</>
              }
            </button>

            {pdfUrl && (
              <a
                href={pdfUrl}
                download={`${filename.replace(/\.[^/.]+$/, '') || 'code'}.pdf`}
                className="flex items-center justify-center gap-2 w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </a>
            )}

            {pdfUrl && (
              <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                PDF ready! Text inside is selectable and copyable.
              </p>
            )}
          </div>

          {/* Supported file types */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Supported file types</p>
            <div className="flex flex-wrap gap-1.5">
              {['.html','.css','.js','.ts','.jsx','.tsx','.py','.java','.c','.cpp','.cs','.php','.rb','.go','.rs','.sql','.json','.xml','.yaml','.sh','.txt','.md'].map(ext => (
                <span key={ext} className="px-2 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-[11px] rounded font-mono">
                  {ext}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
