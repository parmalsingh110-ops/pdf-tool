import { useState, useRef, useCallback } from 'react';
import { Upload, Download, Printer, Layers, ChevronRight } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Link } from 'react-router-dom';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';

type FilterMode = 'magic' | 'bw' | 'grayscale' | 'original';
type Layout = 'vertical' | 'horizontal';

interface CardImage {
  file: File | null;
  url: string | null;
  filteredUrl: string | null;
}

function boxBlurGray(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const dst = new Float32Array(src.length);
  const r = Math.floor(radius / 2);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < r; x++) sum += src[y * w + x];
    for (let x = 0; x < w; x++) {
      if (x + r < w) sum += src[y * w + x + r];
      if (x - r - 1 >= 0) sum -= src[y * w + x - r - 1];
      dst[y * w + x] = sum / Math.min(r + 1 + Math.min(x, r), w);
    }
  }
  const dst2 = new Float32Array(dst.length);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = 0; y < r; y++) sum += dst[y * w + x];
    for (let y = 0; y < h; y++) {
      if (y + r < h) sum += dst[(y + r) * w + x];
      if (y - r - 1 >= 0) sum -= dst[(y - r - 1) * w + x];
      dst2[y * w + x] = sum / Math.min(r + 1 + Math.min(y, r), h);
    }
  }
  return dst2;
}

function applyMagicColor(canvas: HTMLCanvasElement, mode: FilterMode): string {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const w = canvas.width, h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  if (mode === 'original') return canvas.toDataURL('image/jpeg', 0.92);

  if (mode === 'bw') {
    const gray = new Float32Array(w * h);
    for (let i = 0; i < d.length; i += 4) gray[i/4] = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
    const blurred = boxBlurGray(gray, w, h, 15);
    for (let i = 0; i < gray.length; i++) {
      const val = gray[i] > blurred[i] - 10 ? 255 : 0;
      d[i*4] = d[i*4+1] = d[i*4+2] = val;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  if (mode === 'grayscale') {
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
      const s = Math.min(255, Math.max(0, (l - 20) * (255/215)));
      d[i] = d[i+1] = d[i+2] = s;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  // Magic Color: white-patch white balance + per-channel stretch + background whitening + unsharp mask
  const histR = new Uint32Array(256), histG = new Uint32Array(256), histB = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { histR[d[i]]++; histG[d[i+1]]++; histB[d[i+2]]++; }
  const pixCount = w * h;
  const t2 = pixCount * 0.02;
  let wpR=255,wpG=255,wpB=255,bpR=0,bpG=0,bpB=0;
  let cum=0;
  for (let v=255;v>=0;v--){cum+=histR[v];if(cum>=t2){wpR=v;break;}} cum=0;
  for (let v=255;v>=0;v--){cum+=histG[v];if(cum>=t2){wpG=v;break;}} cum=0;
  for (let v=255;v>=0;v--){cum+=histB[v];if(cum>=t2){wpB=v;break;}}
  const t1=pixCount*0.01; cum=0;
  for (let v=0;v<=255;v++){cum+=histR[v];if(cum>=t1){bpR=v;break;}} cum=0;
  for (let v=0;v<=255;v++){cum+=histG[v];if(cum>=t1){bpG=v;break;}} cum=0;
  for (let v=0;v<=255;v++){cum+=histB[v];if(cum>=t1){bpB=v;break;}}
  const sR=255/Math.max(1,wpR-bpR), sG=255/Math.max(1,wpG-bpG), sB=255/Math.max(1,wpB-bpB);
  for (let i=0;i<d.length;i+=4) {
    let r=Math.min(255,Math.max(0,(d[i]-bpR)*sR));
    let g=Math.min(255,Math.max(0,(d[i+1]-bpG)*sG));
    let b=Math.min(255,Math.max(0,(d[i+2]-bpB)*sB));
    const lum=0.299*r+0.587*g+0.114*b;
    const sat=Math.max(r,g,b)-Math.min(r,g,b);
    if (lum>170 && sat<40) {
      const boost=(lum-170)/85;
      r=r+(255-r)*boost*0.9; g=g+(255-g)*boost*0.9; b=b+(255-b)*boost*0.9;
    }
    d[i]=Math.min(255,r); d[i+1]=Math.min(255,g); d[i+2]=Math.min(255,b);
  }
  ctx.putImageData(imageData, 0, 0);

  // Unsharp mask
  const off=document.createElement('canvas'); off.width=w; off.height=h;
  const offCtx=off.getContext('2d')!;
  offCtx.filter='blur(1.5px)'; offCtx.drawImage(canvas,0,0); offCtx.filter='none';
  const sharp=ctx.getImageData(0,0,w,h), blur=offCtx.getImageData(0,0,w,h);
  const sd=sharp.data, bd=blur.data;
  for (let i=0;i<sd.length;i+=4) {
    sd[i]=Math.min(255,Math.max(0,sd[i]+0.6*(sd[i]-bd[i])));
    sd[i+1]=Math.min(255,Math.max(0,sd[i+1]+0.6*(sd[i+1]-bd[i+1])));
    sd[i+2]=Math.min(255,Math.max(0,sd[i+2]+0.6*(sd[i+2]-bd[i+2])));
  }
  ctx.putImageData(sharp, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}

async function processImage(url: string, mode: FilterMode): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 2000;
      let sw = img.naturalWidth, sh = img.naturalHeight;
      if (sw > maxDim || sh > maxDim) {
        const ratio = maxDim / Math.max(sw, sh);
        sw = Math.round(sw * ratio); sh = Math.round(sh * ratio);
      }
      canvas.width = sw; canvas.height = sh;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, sw, sh);
      resolve(applyMagicColor(canvas, mode));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function IdCardJoiner() {
  useSEO(
    'ID Card Front & Back Joiner Online — Aadhaar, PAN & Voter ID Single Page',
    'Join front and back of Aadhaar, PAN card, Driving License or Voter ID onto a single A4 PDF or JPG sheet. Magic color filter whitens paper and enhances ink text.'
  );

  usePageSEO(
    'ID Card Front & Back Joiner — Aadhaar, PAN, Voter ID Print',
    'Upload front and back of Aadhaar card, PAN card or any ID card. Apply Magic Color filter to whiten background and sharpen text. Download print-ready A4 PDF or JPG for government portals. Free, browser-based, no signup.',
    'aadhaar card front back pdf, pan card joiner, id card to pdf, aadhar front back print, voter id pdf, id proof photocopy online, aadhaar front back single page pdf',
    '/id-card-joiner'
  );

  const [front, setFront] = useState<CardImage>({ file: null, url: null, filteredUrl: null });
  const [back, setBack] = useState<CardImage>({ file: null, url: null, filteredUrl: null });
  const [filter, setFilter] = useState<FilterMode>('magic');
  const [layout, setLayout] = useState<Layout>('vertical');
  const [processing, setProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultJpgUrl, setResultJpgUrl] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'done'>('upload');
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const filteredUrl = await processImage(url, filter);
    if (side === 'front') setFront({ file: f, url, filteredUrl });
    else setBack({ file: f, url, filteredUrl });
    // reset result when new image uploaded
    setResultUrl(null); setResultJpgUrl(null); setStep('upload');
  }, [filter]);

  const changeFilter = useCallback(async (mode: FilterMode) => {
    setFilter(mode);
    setResultUrl(null); setResultJpgUrl(null); setStep('upload');
    const updates: Array<[string | null, (fn: (p: CardImage) => CardImage) => void]> = [
      [front.url, setFront],
      [back.url, setBack],
    ];
    for (const [url, setter] of updates) {
      if (url) {
        const fu = await processImage(url, mode);
        (setter as any)(p => ({ ...p, filteredUrl: fu }));
      }
    }
  }, [front.url, back.url]);

  const buildPdf = useCallback(async () => {
    if (!front.filteredUrl || !back.filteredUrl) {
      alert('Please upload both front and back images first.');
      return;
    }
    setProcessing(true);
    try {
      const A4_W = 1240, A4_H = 1754;
      const CARD_W = 882, CARD_H = 556, MARGIN = 80;
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = A4_W; compositeCanvas.height = A4_H;
      const ctx = compositeCanvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, A4_W, A4_H);

      const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
      });
      const frontImg = await loadImg(front.filteredUrl!);
      const backImg = await loadImg(back.filteredUrl!);

      ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 2;
      if (layout === 'vertical') {
        const x = (A4_W - CARD_W) / 2;
        ctx.strokeRect(x-1, MARGIN-1, CARD_W+2, CARD_H+2);
        ctx.drawImage(frontImg, x, MARGIN, CARD_W, CARD_H);
        const yBack = MARGIN + CARD_H + MARGIN;
        ctx.strokeRect(x-1, yBack-1, CARD_W+2, CARD_H+2);
        ctx.drawImage(backImg, x, yBack, CARD_W, CARD_H);
        ctx.fillStyle = '#9ca3af'; ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center';
        ctx.fillText('— Front Side —', A4_W/2, MARGIN + CARD_H + 38);
        ctx.fillText('— Back Side —', A4_W/2, yBack + CARD_H + 38);
      } else {
        const cw = (A4_W - MARGIN*3) / 2;
        const ch = Math.round(cw * (CARD_H / CARD_W));
        const yC = (A4_H - ch) / 2;
        ctx.strokeRect(MARGIN-1, yC-1, cw+2, ch+2);
        ctx.drawImage(frontImg, MARGIN, yC, cw, ch);
        ctx.strokeRect(MARGIN*2+cw-1, yC-1, cw+2, ch+2);
        ctx.drawImage(backImg, MARGIN*2+cw, yC, cw, ch);
        ctx.fillStyle = '#9ca3af'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Front', MARGIN + cw/2, yC + ch + 32);
        ctx.fillText('Back', MARGIN*2 + cw + cw/2, yC + ch + 32);
      }

      const jpgBlob = await new Promise<Blob|null>(r => compositeCanvas.toBlob(b => r(b), 'image/jpeg', 0.85));
      if (jpgBlob) { if (resultJpgUrl) URL.revokeObjectURL(resultJpgUrl); setResultJpgUrl(URL.createObjectURL(jpgBlob)); }

      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595.28, 841.89]);
      const compositeBytes = await new Promise<Uint8Array>((res, rej) => {
        compositeCanvas.toBlob(async (blob) => {
          if (!blob) { rej(new Error('Canvas toBlob failed')); return; }
          res(new Uint8Array(await blob.arrayBuffer()));
        }, 'image/jpeg', 0.88);
      });
      const pdfImg = await pdfDoc.embedJpg(compositeBytes);
      page.drawImage(pdfImg, { x: 0, y: 0, width: 595.28, height: 841.89 });
      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(pdfBlob));
      setStep('done');
    } catch (err: any) {
      alert('Failed: ' + (err?.message || err));
    } finally {
      setProcessing(false);
    }
  }, [front.filteredUrl, back.filteredUrl, layout, resultUrl, resultJpgUrl]);

  const reset = () => {
    [front.url, back.url, resultUrl, resultJpgUrl].forEach(u => { if (u) URL.revokeObjectURL(u); });
    setFront({ file: null, url: null, filteredUrl: null });
    setBack({ file: null, url: null, filteredUrl: null });
    setResultUrl(null); setResultJpgUrl(null); setStep('upload');
  };

  const FILTERS: { mode: FilterMode; label: string; icon: string; desc: string }[] = [
    { mode: 'magic', label: 'Magic Color', icon: '✨', desc: 'White bg + crisp text (CamScanner style)' },
    { mode: 'bw', label: 'B&W Xerox', icon: '🖨️', desc: 'High-contrast B&W for printing' },
    { mode: 'grayscale', label: 'Grayscale', icon: '⚪', desc: 'Smooth photocopy grey' },
    { mode: 'original', label: 'Original', icon: '🔆', desc: 'No filter, keep as-is' },
  ];

  const FAQS = [
    { q: 'Aadhaar card ki front aur back ek page par kaise laayein?', a: 'Front Side aur Back Side ki photos upload karein. Magic Color filter apply hoga. Generate A4 PDF click karein — dono side ek A4 page par aa jaayengi. Print karein ya PDF portal par upload karein.' },
    { q: 'Magic Color filter kya karta hai?', a: 'CamScanner ki tarah: paper ki parchhai (shadow), yellowing, aur uneven lighting ko detect karke pure white background bana deta hai. Text ko sharpen karta hai aur photo ke natural colors preserve karta hai.' },
    { q: 'Kya mera Aadhaar data safe hai?', a: 'Haan — 100% safe. Photos kisi server par upload nahi hoti. Sab processing aapke browser mein hi hoti hai. Aapke device se data bahar nahi jaata.' },
    { q: 'Government portal ke liye JPG ya PDF kaun sa download karein?', a: 'PDF chahiye toh A4 PDF download karein. Image/JPG chahiye aur size limit ho toh JPG download karein. Size limit match karne ke liye humara Target Compress tool use karein.' },
    { q: 'Voter ID, Driving License, Employee ID bhi kar sakta hoon?', a: 'Bilkul! Kisi bhi card ka Front + Back — Voter ID, Driving License, Employee ID, Student ID — sab ke liye ye tool kaam karta hai.' },
  ];

  return (
    <div className="flex-1 flex flex-col items-center p-4 sm:p-8 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 min-h-screen">
      {/* Header */}
      <div className="text-center mb-8 max-w-3xl mx-auto px-4">
        <div className="inline-flex items-center gap-2 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 text-xs font-bold px-3 py-1 rounded-full mb-4 border border-orange-200 dark:border-orange-800">
          🪪 AADHAAR · PAN · VOTER ID · ANY ID CARD
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-3 leading-tight">
          ID Card Front &amp; Back Joiner
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
          Upload Aadhaar, PAN or any ID card front &amp; back. <strong>Magic Color</strong> filter whitens background &amp; sharpens text like CamScanner.
          Get a <strong>print-ready A4 PDF</strong> in seconds — <span className="text-orange-600 font-semibold">free, private, no upload to server</span>.
        </p>
      </div>

      <div className="w-full max-w-5xl space-y-5">
        {/* Filter */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">🎨 Enhancement Filter</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FILTERS.map(f => (
              <button key={f.mode} onClick={() => changeFilter(f.mode)}
                className={`rounded-xl border-2 p-3 text-left transition-all ${filter===f.mode?'border-orange-500 bg-orange-50 dark:bg-orange-950/40':'border-slate-200 dark:border-slate-700 hover:border-orange-300 hover:bg-orange-50/50 dark:hover:bg-orange-950/20'}`}>
                <div className="text-xl mb-1">{f.icon}</div>
                <div className={`text-xs font-bold ${filter===f.mode?'text-orange-600 dark:text-orange-400':'text-slate-700 dark:text-slate-300'}`}>{f.label}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 hidden sm:block leading-tight">{f.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Upload Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([
            { label: 'Front Side (Aage ka Photo)', side: 'front' as const, ref: frontRef, card: front },
            { label: 'Back Side (Peeche ka Photo)', side: 'back' as const, ref: backRef, card: back },
          ]).map(({ label, side, ref, card }) => (
            <div key={side} className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-orange-400 dark:hover:border-orange-500 transition-colors overflow-hidden">
              <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e, side)} />
              {card.filteredUrl ? (
                <div className="p-3">
                  <img src={card.filteredUrl} alt={label} className="w-full rounded-xl object-cover max-h-52 border border-slate-100 dark:border-slate-700" />
                  <div className="flex items-center justify-between mt-2 px-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[140px]">{card.file?.name}</span>
                    <button onClick={() => ref.current?.click()} className="text-xs text-orange-600 dark:text-orange-400 font-bold hover:underline">Change</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => ref.current?.click()} className="w-full p-8 flex flex-col items-center gap-3 group">
                  <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">🪪</div>
                  <div className="text-center">
                    <p className="font-bold text-slate-800 dark:text-white text-sm">{label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Click to upload JPG / PNG / HEIC</p>
                  </div>
                  <div className="px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold flex items-center gap-1 group-hover:bg-orange-600 transition-colors">
                    <Upload className="w-3 h-3" /> Upload Photo
                  </div>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Layout + Generate */}
        {(front.filteredUrl || back.filteredUrl) && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><Layers className="w-4 h-4" /> A4 Page Layout</h2>
            <div className="flex gap-3 mb-5">
              {([
                { val: 'vertical' as Layout, label: '📄 Vertical Stack', desc: 'Front on top, Back below — ideal for printing' },
                { val: 'horizontal' as Layout, label: '📋 Side by Side', desc: 'Both cards next to each other' },
              ]).map(l => (
                <button key={l.val} onClick={() => setLayout(l.val)}
                  className={`flex-1 rounded-xl border-2 p-3 text-left transition-all ${layout===l.val?'border-orange-500 bg-orange-50 dark:bg-orange-950/40':'border-slate-200 dark:border-slate-700 hover:border-orange-300'}`}>
                  <p className={`text-xs font-bold ${layout===l.val?'text-orange-600 dark:text-orange-400':'text-slate-700 dark:text-slate-300'}`}>{l.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 hidden sm:block">{l.desc}</p>
                </button>
              ))}
            </div>
            <button onClick={buildPdf} disabled={!front.filteredUrl||!back.filteredUrl||processing}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 text-white font-extrabold text-base shadow-lg hover:from-orange-600 hover:to-rose-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {processing ? (<><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>Generating…</>) : (<><Printer className="w-5 h-5"/>Generate Print-Ready A4 PDF &amp; JPG</>)}
            </button>
            {(!front.filteredUrl || !back.filteredUrl) && <p className="text-center text-xs text-slate-400 mt-2">Upload both Front &amp; Back to generate</p>}
          </div>
        )}

        {/* Result */}
        {step==='done' && resultUrl && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/30 rounded-2xl border border-green-200 dark:border-green-800 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center text-xl font-bold">✓</div>
              <div>
                <h3 className="font-extrabold text-green-800 dark:text-green-300 text-lg">Your ID card sheet is ready!</h3>
                <p className="text-xs text-green-700 dark:text-green-400">Magic Color applied — background whitened, text sharpened.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a href={resultUrl} download="id-card-print.pdf" className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 transition-colors shadow-md">
                <Download className="w-4 h-4"/>Download A4 PDF (for Printing)
              </a>
              {resultJpgUrl && (
                <a href={resultJpgUrl} download="id-card-sheet.jpg" className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors shadow-md">
                  <Download className="w-4 h-4"/>Download JPG (for Portal Upload)
                </a>
              )}
            </div>
            <button onClick={reset} className="mt-4 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium mx-auto block">↩ Process Another Card</button>
          </div>
        )}

        {/* FAQ */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {FAQS.map((item, i) => (
              <details key={i} className="group border-b border-slate-100 dark:border-slate-700 pb-4 last:border-0 last:pb-0">
                <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-200 hover:text-orange-600 dark:hover:text-orange-400">
                  {item.q}
                  <ChevronRight className="w-4 h-4 shrink-0 ml-2 group-open:rotate-90 transition-transform"/>
                </summary>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Related Tools */}
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 rounded-2xl border border-orange-100 dark:border-orange-900 p-5">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">🎓 Also useful for Exam &amp; Portal forms:</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { to:'/increase-size', label:'📈 Increase PDF Size', desc:'Meet min file size' },
              { to:'/target-compress', label:'🎯 Target Compress', desc:'Exact KB PDF' },
              { to:'/passport-photo-sheet', label:'🖼️ Passport Photo Sheet', desc:'8 photos on 4×6' },
              { to:'/exact-image-size', label:'⚖️ Exact Image Size', desc:'Photo 20KB–50KB' },
            ].map(item=>(
              <Link key={item.to} to={item.to} className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-orange-100 dark:border-orange-900 hover:border-orange-400 hover:shadow-md transition-all group">
                <p className="text-xs font-bold text-slate-800 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400">{item.label}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
