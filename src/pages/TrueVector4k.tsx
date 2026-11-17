import React, { useState, useRef, useCallback } from 'react';
import {
  Sparkles,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Image as ImageIcon,
  Palette,
  FileCheck,
  CheckCircle2,
  PenTool,
  Search,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import FileDropzone from '../components/FileDropzone';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlProcessCard, PearlScanOverlay } from '../components/pearl/PearlMotion';
import ToolSEOSection from '../components/ToolSEOSection';
import { apiFetch } from '../lib/api';
import { toArrayBufferBytes } from '../lib/blobUrl';
import { dataUrlToBytes, downloadBlob } from '../lib/utils';

type TrueVectorPreset = 'true_vector' | 'blueprint_cad' | 'adaptive_4k' | 'photocopy_bw';

interface EnhanceConfig {
  mode: TrueVectorPreset;
  resolutionScale: number;
  sharpnessLevel: number;
  paperWhitening: number;
  inkDarkening: number;
  colorMode: 'color' | 'bw';
  colorVibrance: number;
  shadowRemoval: number;
  includeOcr: boolean;
}

const IMAGE_ACCEPT_RE = /\.(jpe?g|png|webp|bmp)$/i;

function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([toArrayBufferBytes(bytes)], { type: mime });
}

/**
 * Local Browser Fallback Engine with Integral-Image Adaptive Shadow Normalization
 * (replaces global-only threshold so unevenly lit mobile camera photos still bleach evenly).
 */
async function enhanceCanvasLocalFallback(
  source: any, // pdfjs page OR HTMLImageElement
  isImageFile: boolean,
  config: EnhanceConfig
): Promise<{ enhancedDataUrl: string; origW: number; origH: number; previewUrl: string }> {
  let origW = 595;
  let origH = 842;
  let w = 1200;
  let h = 1600;
  const canvas = document.createElement('canvas');
  let previewUrl = '';

  if (isImageFile) {
    const im = source as HTMLImageElement;
    origW = Math.round((im.naturalWidth * 72) / 150);
    origH = Math.round((im.naturalHeight * 72) / 150);
    const scaleUp = Math.min(2.5, Math.max(1.0, 1800 / Math.max(im.naturalWidth, im.naturalHeight, 1)));
    w = Math.round(im.naturalWidth * scaleUp);
    h = Math.round(im.naturalHeight * scaleUp);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(im, 0, 0, w, h);

    const pCanvas = document.createElement('canvas');
    pCanvas.width = Math.min(1100, im.naturalWidth);
    pCanvas.height = Math.round((pCanvas.width / Math.max(1, im.naturalWidth)) * im.naturalHeight);
    pCanvas.getContext('2d')!.drawImage(im, 0, 0, pCanvas.width, pCanvas.height);
    previewUrl = pCanvas.toDataURL('image/jpeg', 0.85);
    pCanvas.width = 0;
  } else {
    const page = source;
    const baseVp = page.getViewport({ scale: 1.0 });
    origW = Math.round(baseVp.width);
    origH = Math.round(baseVp.height);
    const viewport = page.getViewport({ scale: config.resolutionScale });
    w = Math.round(viewport.width);
    h = Math.round(viewport.height);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const pCanvas = document.createElement('canvas');
    const prevScale = Math.min(1.4, config.resolutionScale);
    const prevVp = page.getViewport({ scale: prevScale });
    pCanvas.width = Math.round(prevVp.width);
    pCanvas.height = Math.round(prevVp.height);
    pCanvas.getContext('2d')!.drawImage(canvas, 0, 0, pCanvas.width, pCanvas.height);
    previewUrl = pCanvas.toDataURL('image/jpeg', 0.85);
    pCanvas.width = 0;
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const totalPixels = w * h;

  const gray = new Float32Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    gray[i] = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
  }

  // Adaptive local paper illumination grid (integral sum over radius ~3% of page) for shadow division
  const winR = Math.max(12, Math.round(Math.min(w, h) * 0.032));
  const bgGrid = new Float32Array(totalPixels);
  const temp = new Float32Array(totalPixels);
  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    let sum = 0;
    let cnt = 0;
    for (let x = -winR; x <= winR; x++) {
      if (x >= 0 && x < w) {
        sum += gray[rowOff + x];
        cnt++;
      }
    }
    for (let x = 0; x < w; x++) {
      temp[rowOff + x] = sum / cnt;
      if (x - winR >= 0) {
        sum -= gray[rowOff + x - winR];
        cnt--;
      }
      if (x + winR + 1 < w) {
        sum += gray[rowOff + x + winR + 1];
        cnt++;
      }
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    let cnt = 0;
    for (let y = -winR; y <= winR; y++) {
      if (y >= 0 && y < h) {
        sum += temp[y * w + x];
        cnt++;
      }
    }
    for (let y = 0; y < h; y++) {
      bgGrid[y * w + x] = sum / cnt;
      if (y - winR >= 0) {
        sum -= temp[(y - winR) * w + x];
        cnt--;
      }
      if (y + winR + 1 < h) {
        sum += temp[(y + winR + 1) * w + x];
        cnt++;
      }
    }
  }

  // Edge-sharpen radius 2
  const blurred = new Float32Array(totalPixels);
  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = 2; x < w - 2; x++) {
      blurred[rowOff + x] = (gray[rowOff + x - 1] + gray[rowOff + x] + gray[rowOff + x + 1]) / 3;
    }
  }

  const shadowBlend = Math.max(0, Math.min(1, config.shadowRemoval / 100));
  const sharpness = config.sharpnessLevel;
  const paperThresh = config.paperWhitening;
  const inkFactor = config.inkDarkening / 100;
  const vibFactor = config.colorVibrance / 100;
  const isColorDoc = config.colorMode === 'color';

  for (let i = 0; i < totalPixels; i++) {
    const origG = gray[i];
    const localBg = Math.max(35, bgGrid[i] + 18); // lift background envelope above stroke dip
    const shadowNormalized = Math.min(255, (origG / localBg) * 255);
    const baseG = origG * (1 - shadowBlend) + shadowNormalized * shadowBlend;
    const delta = (origG - blurred[i]) * sharpness;
    const sharpG = baseG + delta;

    const pIdx = i * 4;
    const r = data[pIdx];
    const g = data[pIdx + 1];
    const b = data[pIdx + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);

    if (!isColorDoc) {
      if (sharpG >= paperThresh) {
        data[pIdx] = 255;
        data[pIdx + 1] = 255;
        data[pIdx + 2] = 255;
      } else {
        const val = Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, sharpG / paperThresh), 1.35) * inkFactor * 255)));
        data[pIdx] = val;
        data[pIdx + 1] = val;
        data[pIdx + 2] = val;
      }
    } else if (sharpG >= paperThresh && chroma < 25) {
      data[pIdx] = 255;
      data[pIdx + 1] = 255;
      data[pIdx + 2] = 255;
    } else if (chroma < 14) {
      const val = Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, sharpG / paperThresh), 1.35) * inkFactor * 255)));
      data[pIdx] = val;
      data[pIdx + 1] = val;
      data[pIdx + 2] = val;
    } else {
      const sr = Math.max(0, Math.min(255, r + delta));
      const sg = Math.max(0, Math.min(255, g + delta));
      const sb = Math.max(0, Math.min(255, b + delta));
      const lum = 0.299 * sr + 0.587 * sg + 0.114 * sb;
      data[pIdx] = Math.max(0, Math.min(255, Math.round(lum + (sr - lum) * vibFactor)));
      data[pIdx + 1] = Math.max(0, Math.min(255, Math.round(lum + (sg - lum) * vibFactor)));
      data[pIdx + 2] = Math.max(0, Math.min(255, Math.round(lum + (sb - lum) * vibFactor)));
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const enhancedDataUrl = canvas.toDataURL('image/jpeg', 0.94);
  canvas.width = 0;
  canvas.height = 0;
  return { enhancedDataUrl, origW, origH, previewUrl };
}

export default function TrueVector4k() {
  useSEO(
    'TrueVector 4K™ — Mathematical Bezier Vectorizer & Scan Restorer | PDF Media Suite',
    'Vectorize blueprints, CAD diagrams, logos, and blurry 72 DPI scans into mathematical Cubic Bezier SVG & Vector PDFs. Includes morphological shadow removal and searchable OCR.'
  );

  usePageSEO(
    'TrueVector 4K™ — Blueprint Vectorizer & 4K Ultra-HD Restorer',
    'Convert blurry scans and camera snaps into infinite-zoom Cubic Bezier SVG & Vector PDFs or shadow-free 4K color documents with optional RapidOCR searchable text.',
    'pdf vectorizer online, scan to vector svg, trace blueprint to bezier pdf, remove camera shadow pdf scan, depixelate scan 4k',
    '/true-vector-4k'
  );

  const [file, setFile] = useState<File | null>(null);
  const [isImageInput, setIsImageInput] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Controls
  const [presetMode, setPresetMode] = useState<TrueVectorPreset>('true_vector');
  const [colorMode, setColorMode] = useState<'color' | 'bw'>('color');
  const [sharpnessLevel, setSharpnessLevel] = useState<number>(1.7);
  const [paperWhitening, setPaperWhitening] = useState<number>(212);
  const [inkDarkening, setInkDarkening] = useState<number>(75);
  const [colorVibrance, setColorVibrance] = useState<number>(130);
  const [shadowRemoval, setShadowRemoval] = useState<number>(85);
  const [includeOcr, setIncludeOcr] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [previewMode, setPreviewMode] = useState<'enhanced' | 'svg'>('enhanced');

  // Batch State
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [allPagesProgress, setAllPagesProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // Outputs & Telemetry
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [enhancedImageUrl, setEnhancedImageUrl] = useState<string | null>(null);
  const [svgPreviewUrl, setSvgPreviewUrl] = useState<string | null>(null);
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [enhancedPdfBlob, setEnhancedPdfBlob] = useState<Blob | null>(null);
  const [vectorStats, setVectorStats] = useState<{
    engine: string;
    isTrueVector: boolean;
    pathCount: number;
    bezierNodes: number;
    ocrWords: number;
  } | null>(null);

  const prefersReduced = useReducedMotion();
  const pdfDocRef = useRef<any>(null);
  const imgElementRef = useRef<HTMLImageElement | null>(null);

  const updateSvgPreview = useCallback((markup: string) => {
    setSvgMarkup(markup);
    setSvgPreviewUrl((prev) => {
      if (prev && prev.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(prev);
        } catch {}
      }
      if (!markup) return null;
      return URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
    });
  }, []);

  const processPage = useCallback(
    async (
      targetFile: File,
      isImg: boolean,
      pageNum: number,
      overrideConfig?: EnhanceConfig
    ) => {
      setIsProcessing(true);
      setPreviewMode('enhanced');

      const config: EnhanceConfig = overrideConfig || {
        mode: presetMode,
        resolutionScale: 3.0,
        sharpnessLevel,
        paperWhitening,
        inkDarkening,
        colorMode,
        colorVibrance,
        shadowRemoval,
        includeOcr,
      };

      const isVec = config.mode === 'true_vector' || config.mode === 'blueprint_cad';
      setProcessingStatus(
        isVec
          ? 'Normalizing paper shadows & tracing mathematical Cubic Bezier vectors...'
          : 'Running morphological shadow division & bilateral 4K restoration...'
      );

      // 1. Primary: Deep Backend OpenCV Vectorizer & Shadow-Normalization Engine
      let backendOk = false;
      try {
        const fd = new FormData();
        fd.append('file', targetFile, targetFile.name);
        fd.append('mode', config.mode);
        fd.append('color_mode', config.colorMode);
        fd.append('sharpness', String(config.sharpnessLevel));
        fd.append('paper_whitening', String(config.paperWhitening));
        fd.append('ink_darkness', String(config.inkDarkening));
        fd.append('color_vibrance', String(config.colorVibrance));
        fd.append('shadow_removal', String(config.shadowRemoval));
        fd.append('dpi_target', '280');
        fd.append('page_num', String(pageNum));
        fd.append('include_ocr', String(config.includeOcr));
        fd.append('output_format', 'json_bundle');

        const res = await apiFetch('/convert/true-vector-4k', {
          method: 'POST',
          body: fd,
          timeoutMs: 32000,
          suppressTelemetry: true,
        });

        if (res.ok) {
          const data = await res.json();
          setOriginalImageUrl(data.original_preview || null);
          setEnhancedImageUrl(data.enhanced_preview || null);
          updateSvgPreview(data.svg_markup || '');
          if (data.svg_markup && isVec) {
            setPreviewMode('svg');
          }
          if (data.pdf_b64) {
            setEnhancedPdfBlob(b64ToBlob(data.pdf_b64, 'application/pdf'));
          }
          setVectorStats({
            engine: isVec ? 'Backend OpenCV RETR_CCOMP Bezier Tracer' : 'Backend LAB Illumination + Bilateral 4K',
            isTrueVector: Boolean(data.is_true_vector),
            pathCount: data.path_count || 0,
            bezierNodes: data.bezier_nodes || 0,
            ocrWords: data.ocr_words || 0,
          });
          backendOk = true;
        }
      } catch (err) {
        console.warn('[TrueVector4k] Backend unavailable, running local illumination-normalized engine:', err);
      }

      // 2. Fallback: Local Adaptive Shadow-Normalizing Canvas Engine
      if (!backendOk) {
        try {
          let srcObj: any = imgElementRef.current;
          if (!isImg && pdfDocRef.current) {
            srcObj = await pdfDocRef.current.getPage(pageNum);
          }
          if (srcObj) {
            const { enhancedDataUrl, origW, origH, previewUrl } = await enhanceCanvasLocalFallback(
              srcObj,
              isImg,
              config
            );
            setOriginalImageUrl(previewUrl);
            setEnhancedImageUrl(enhancedDataUrl);
            updateSvgPreview('');

            const newPdf = await PDFDocument.create();
            const pdfPage = newPdf.addPage([origW, origH]);
            const embeddedImg = await newPdf.embedJpg(dataUrlToBytes(enhancedDataUrl));
            pdfPage.drawImage(embeddedImg, { x: 0, y: 0, width: origW, height: origH });
            const pdfBytes = await newPdf.save();
            setEnhancedPdfBlob(new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' }));
            setVectorStats({
              engine: 'Local Browser Adaptive-Illumination Fallback',
              isTrueVector: false,
              pathCount: 0,
              bezierNodes: 0,
              ocrWords: 0,
            });
          }
        } catch (locErr) {
          console.error('[TrueVector4k] Local fallback failed:', locErr);
        }
      }

      setIsProcessing(false);
    },
    [
      presetMode,
      sharpnessLevel,
      paperWhitening,
      inkDarkening,
      colorMode,
      colorVibrance,
      shadowRemoval,
      includeOcr,
      updateSvgPreview,
    ]
  );

  const handlePresetChange = (preset: TrueVectorPreset) => {
    setPresetMode(preset);
    let newColor: 'color' | 'bw' = colorMode;
    let newSharp = 1.6;
    let newPaper = 212;
    let newInk = 75;
    let newVib = 130;
    let newShadow = 85;

    if (preset === 'true_vector') {
      newColor = 'color';
      newSharp = 1.7;
      newPaper = 212;
      newInk = 78;
      newVib = 135;
      newShadow = 90;
    } else if (preset === 'blueprint_cad') {
      newColor = 'color';
      newSharp = 2.2;
      newPaper = 200;
      newInk = 85;
      newVib = 145;
      newShadow = 92;
    } else if (preset === 'adaptive_4k') {
      newColor = 'color';
      newSharp = 1.5;
      newPaper = 210;
      newInk = 75;
      newVib = 130;
      newShadow = 85;
    } else if (preset === 'photocopy_bw') {
      newColor = 'bw';
      newSharp = 1.9;
      newPaper = 218;
      newInk = 65;
      newVib = 100;
      newShadow = 95;
    }

    setColorMode(newColor);
    setSharpnessLevel(newSharp);
    setPaperWhitening(newPaper);
    setInkDarkening(newInk);
    setColorVibrance(newVib);
    setShadowRemoval(newShadow);

    if (file) {
      void processPage(file, isImageInput, currentPage, {
        mode: preset,
        resolutionScale: 3.0,
        sharpnessLevel: newSharp,
        paperWhitening: newPaper,
        inkDarkening: newInk,
        colorMode: newColor,
        colorVibrance: newVib,
        shadowRemoval: newShadow,
        includeOcr,
      });
    }
  };

  const handleFileUpload = async (selectedFile: File) => {
    const isPdf = selectedFile.type === 'application/pdf' || /\.pdf$/i.test(selectedFile.name);
    const isImg = selectedFile.type.startsWith('image/') || IMAGE_ACCEPT_RE.test(selectedFile.name);
    if (!isPdf && !isImg) {
      alert('Please upload a PDF document or JPG/PNG/WebP image scan.');
      return;
    }

    setFile(selectedFile);
    setIsImageInput(isImg);

    try {
      if (isImg) {
        pdfDocRef.current = null;
        const url = URL.createObjectURL(selectedFile);
        const im = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = url;
        });
        imgElementRef.current = im;
        setTotalPages(1);
        setCurrentPage(1);
        await processPage(selectedFile, true, 1);
      } else {
        imgElementRef.current = null;
        const buf = await selectedFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
        await processPage(selectedFile, false, 1);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to load document for vectorization / 4K restoration.');
    }
  };

  const handleDownloadSvg = async () => {
    if (!file) return;
    if (svgMarkup) {
      downloadBlob(
        new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }),
        `TrueVector_p${currentPage}_${file.name.replace(/\.[^.]+$/, '')}.svg`
      );
      return;
    }
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('mode', 'true_vector');
      fd.append('color_mode', colorMode);
      fd.append('sharpness', String(sharpnessLevel));
      fd.append('paper_whitening', String(paperWhitening));
      fd.append('ink_darkness', String(inkDarkening));
      fd.append('color_vibrance', String(colorVibrance));
      fd.append('shadow_removal', String(shadowRemoval));
      fd.append('page_num', String(currentPage));
      fd.append('output_format', 'svg');
      const res = await apiFetch('/convert/true-vector-4k', { method: 'POST', body: fd, timeoutMs: 30000 });
      if (!res.ok) throw new Error('SVG trace failed');
      const svgBlob = await res.blob();
      downloadBlob(svgBlob, `TrueVector_p${currentPage}_${file.name.replace(/\.[^.]+$/, '')}.svg`);
    } catch {
      alert('SVG Vector tracing requires backend OpenCV engine connectivity.');
    }
  };

  const handleDownloadAllPages = async () => {
    if (!file) return;
    setIsProcessingAll(true);
    setAllPagesProgress({ current: 1, total: totalPages });

    try {
      // Try backend all-page vector/4K export first
      const fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('mode', presetMode);
      fd.append('color_mode', colorMode);
      fd.append('sharpness', String(sharpnessLevel));
      fd.append('paper_whitening', String(paperWhitening));
      fd.append('ink_darkness', String(inkDarkening));
      fd.append('color_vibrance', String(colorVibrance));
      fd.append('shadow_removal', String(shadowRemoval));
      fd.append('dpi_target', '250');
      fd.append('page_num', '0');
      fd.append('include_ocr', String(includeOcr));
      fd.append('output_format', 'pdf');

      const res = await apiFetch('/convert/true-vector-4k', { method: 'POST', body: fd, timeoutMs: 90000 });
      if (res.ok) {
        const outBlob = await res.blob();
        downloadBlob(outBlob, `TrueVector_4K_All_${file.name.replace(/\.[^.]+$/, '')}.pdf`);
        setIsProcessingAll(false);
        return;
      }
    } catch {}

    // Client fallback multi-page export
    try {
      if (!pdfDocRef.current) throw new Error('PDF not loaded');
      const newPdf = await PDFDocument.create();
      const cfg: EnhanceConfig = {
        mode: presetMode,
        resolutionScale: 2.6,
        sharpnessLevel,
        paperWhitening,
        inkDarkening,
        colorMode,
        colorVibrance,
        shadowRemoval,
        includeOcr: false,
      };
      for (let p = 1; p <= totalPages; p++) {
        setAllPagesProgress({ current: p, total: totalPages });
        const page = await pdfDocRef.current.getPage(p);
        const { enhancedDataUrl, origW, origH } = await enhanceCanvasLocalFallback(page, false, cfg);
        const embeddedImg = await newPdf.embedJpg(dataUrlToBytes(enhancedDataUrl));
        const pdfPage = newPdf.addPage([origW, origH]);
        pdfPage.drawImage(embeddedImg, { x: 0, y: 0, width: origW, height: origH });
      }
      const finalBytes = await newPdf.save();
      downloadBlob(new Blob([toArrayBufferBytes(finalBytes)], { type: 'application/pdf' }), `TrueVector_4K_All_${file.name}`);
    } catch (err) {
      console.error('All pages error:', err);
      alert('Failed to process all pages.');
    } finally {
      setIsProcessingAll(false);
    }
  };

  const activeRightSrc = previewMode === 'svg' && svgPreviewUrl ? svgPreviewUrl : enhancedImageUrl;

  return (
    <ToolWorkspaceShell
      title="TrueVector 4K™"
      subtitle="Trace blueprints, seals, and scanned notes into infinite-zoom Cubic Bezier SVG & Vector PDFs, or remove uneven camera shadows with morphological 4K color restoration and RapidOCR text indexing."
      categoryLabel="Mathematical Bezier Vectorizer & Illumination-Normalized 4K Restorer"
      icon={Sparkles}
      microVariant="ocr"
      tone="sky"
      trustNote="OpenCV RETR_CCOMP Bezier Tracing • Shadow Illumination Division • RapidOCR Searchable"
    >
      <div className="w-full max-w-7xl mx-auto space-y-8 relative">
        <PearlScanOverlay
          active={isProcessingAll}
          label={`Vectorizing & restoring all pages (${allPagesProgress.current}/${allPagesProgress.total})...`}
        />

        {enhancedPdfBlob && (
          <div className="pms-glass-panel p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[var(--pms-ink)]">
                Page {currentPage} / {totalPages}
              </span>
              {vectorStats && (
                <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25">
                  {vectorStats.isTrueVector ? (
                    <>
                      TRUE VECTOR: <AnimatedNumber value={vectorStats.pathCount} suffix=" paths" /> ·{' '}
                      <AnimatedNumber value={vectorStats.bezierNodes} suffix=" nodes" />
                    </>
                  ) : (
                    vectorStats.engine
                  )}
                  {vectorStats.ocrWords > 0 && ` · ${vectorStats.ocrWords} OCR words`}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={handleDownloadSvg}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-violet-500/12 hover:bg-violet-500/20 border border-violet-500/30 text-violet-700 dark:text-violet-300 font-bold text-xs cursor-pointer transition-colors"
              >
                <PenTool className="w-3.5 h-3.5" /> Scalable .SVG Vector
              </button>

              {enhancedImageUrl && (
                <button
                  onClick={() =>
                    downloadBlob(
                      new Blob([toArrayBufferBytes(dataUrlToBytes(enhancedImageUrl))], { type: 'image/png' }),
                      `TrueVector_p${currentPage}_${file?.name.replace(/\.[^.]+$/, '') || 'page'}.png`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/75 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 border border-[var(--pms-border)] text-[var(--pms-ink)] font-bold text-xs cursor-pointer transition-colors"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" /> Hi-Res PNG
                </button>
              )}

              {totalPages > 1 && (
                <button
                  disabled={isProcessingAll}
                  onClick={handleDownloadAllPages}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-50/90 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 font-bold text-xs cursor-pointer transition-colors disabled:opacity-50"
                >
                  <FileCheck className="w-4 h-4" />
                  {isProcessingAll ? `Processing ${allPagesProgress.current}/${allPagesProgress.total}...` : `All ${totalPages} Pages PDF`}
                </button>
              )}

              <button
                onClick={() =>
                  downloadBlob(
                    enhancedPdfBlob,
                    `${vectorStats?.isTrueVector ? 'TrueVector_Bezier' : 'TrueVector_4K'}_p${currentPage}_${file?.name.replace(/\.[^.]+$/, '') || 'doc'}.pdf`
                  )
                }
                className="pms-btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer"
              >
                <Download className="w-4 h-4" />
                {vectorStats?.isTrueVector ? 'Download True Vector PDF' : 'Download 4K Restored PDF'}
              </button>
            </div>
          </div>
        )}

        {/* Feature Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-2.5 p-3.5 rounded-2xl pms-glass-panel text-xs">
            <CheckCircle2 className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
            <span className="text-[var(--pms-muted)]">
              <strong className="text-[var(--pms-ink)]">Mathematical Bezier Tracing:</strong> Exports infinite-zoom SVG &amp; PDF vector paths with even-odd holes.
            </span>
          </div>
          <div className="flex items-center gap-2.5 p-3.5 rounded-2xl pms-glass-panel text-xs">
            <CheckCircle2 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="text-[var(--pms-muted)]">
              <strong className="text-[var(--pms-ink)]">Shadow Illumination Division:</strong> Removes harsh mobile camera &amp; lamp shadows across crooked pages.
            </span>
          </div>
          <div className="flex items-center gap-2.5 p-3.5 rounded-2xl pms-glass-panel text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-[var(--pms-muted)]">
              <strong className="text-[var(--pms-ink)]">Blue/Red Ink &amp; OCR Layer:</strong> Preserves colored signatures &amp; optionally embeds searchable RapidOCR text.
            </span>
          </div>
        </div>

        {/* Upload */}
        {!file && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.22 }}
            className="w-full max-w-2xl mx-auto"
          >
            <FileDropzone
              onDrop={(files) => files[0] && handleFileUpload(files[0])}
              multiple={false}
              accept={{
                'application/pdf': ['.pdf'],
                'image/jpeg': ['.jpg', '.jpeg'],
                'image/png': ['.png'],
                'image/webp': ['.webp'],
              }}
              title="Upload Blueprint, Blurry Scan, or Camera Photo (PDF / JPG / PNG)"
              subtitle="Traces crisp Cubic Bezier vectors (.SVG + Vector .PDF) or runs shadow-removing 4K color restoration with searchable OCR"
            />
          </motion.div>
        )}

        {isProcessing && (
          <PearlProcessCard
            title="Running TrueVector 4K Engine..."
            stageLabel={presetMode === 'true_vector' || presetMode === 'blueprint_cad' ? 'Bezier curve vectorization' : 'Morphological shadow normalization'}
            subtitle={processingStatus}
            accent="blue"
            className="max-w-xl mx-auto"
          />
        )}

        {!isProcessing && file && originalImageUrl && activeRightSrc && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.24 }}
            className="space-y-6"
          >
            {/* Pro Control Toolbar */}
            <div className="p-5 rounded-3xl pms-glass-panel space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Presets */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-[var(--pms-muted)] mr-1 flex items-center gap-1">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" /> Mode:
                  </span>
                  <button
                    onClick={() => handlePresetChange('true_vector')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      presetMode === 'true_vector'
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'bg-white/70 dark:bg-slate-800/80 border border-[var(--pms-border)] text-[var(--pms-ink)]'
                    }`}
                  >
                    <PenTool className="w-3 h-3" /> True Vector Bézier
                  </button>
                  <button
                    onClick={() => handlePresetChange('blueprint_cad')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      presetMode === 'blueprint_cad'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-white/70 dark:bg-slate-800/80 border border-[var(--pms-border)] text-[var(--pms-ink)]'
                    }`}
                  >
                    Blueprint &amp; CAD Vector
                  </button>
                  <button
                    onClick={() => handlePresetChange('adaptive_4k')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      presetMode === 'adaptive_4k'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-white/70 dark:bg-slate-800/80 border border-[var(--pms-border)] text-[var(--pms-ink)]'
                    }`}
                  >
                    <Palette className="w-3 h-3" /> 4K Color Scan + Shadows
                  </button>
                  <button
                    onClick={() => handlePresetChange('photocopy_bw')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      presetMode === 'photocopy_bw'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-white/70 dark:bg-slate-800/80 border border-[var(--pms-border)] text-[var(--pms-ink)]'
                    }`}
                  >
                    Laser Photocopy B&amp;W
                  </button>
                </div>

                {/* Zoom & Preview Type */}
                <div className="flex items-center gap-3 flex-wrap">
                  {svgPreviewUrl && (
                    <div className="flex items-center gap-1 bg-white/60 dark:bg-slate-900/75 p-1 rounded-2xl border border-[var(--pms-border)]">
                      <button
                        onClick={() => setPreviewMode('svg')}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer ${
                          previewMode === 'svg' ? 'bg-violet-600 text-white' : 'text-[var(--pms-muted)]'
                        }`}
                      >
                        Live SVG Vector
                      </button>
                      <button
                        onClick={() => setPreviewMode('enhanced')}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer ${
                          previewMode === 'enhanced' ? 'bg-sky-600 text-white' : 'text-[var(--pms-muted)]'
                        }`}
                      >
                        PDF Render
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-1 bg-white/60 dark:bg-slate-900/75 p-1 rounded-2xl border border-[var(--pms-border)]">
                    <span className="text-[11px] font-bold text-[var(--pms-muted)] px-2 flex items-center gap-1">
                      <Search className="w-3 h-3" /> Zoom:
                    </span>
                    {[100, 200, 400, 800].map((z) => (
                      <button
                        key={z}
                        onClick={() => setZoomLevel(z)}
                        className={`px-2 py-1 rounded-xl text-xs font-mono font-bold cursor-pointer transition-colors ${
                          zoomLevel === z ? 'bg-sky-600 text-white' : 'text-[var(--pms-muted)] hover:text-[var(--pms-ink)]'
                        }`}
                      >
                        {z}%
                      </button>
                    ))}
                  </div>

                  {!isImageInput && totalPages > 1 && (
                    <div className="flex items-center gap-1.5 bg-white/60 dark:bg-slate-900/75 p-1 rounded-2xl border border-[var(--pms-border)]">
                      <button
                        disabled={currentPage <= 1}
                        onClick={() => {
                          const next = currentPage - 1;
                          setCurrentPage(next);
                          void processPage(file, false, next);
                        }}
                        className="p-1.5 rounded-xl bg-white/80 dark:bg-slate-800 text-[var(--pms-ink)] disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-bold text-[var(--pms-ink)] px-1 font-mono">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        disabled={currentPage >= totalPages}
                        onClick={() => {
                          const next = currentPage + 1;
                          setCurrentPage(next);
                          void processPage(file, false, next);
                        }}
                        className="p-1.5 rounded-xl bg-white/80 dark:bg-slate-800 text-[var(--pms-ink)] disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Tuning Sliders */}
              <div className="pt-3 border-t border-[var(--pms-border)] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center flex-wrap gap-5">
                  <div className="flex items-center gap-1 bg-white/60 dark:bg-slate-900/75 p-1 rounded-2xl border border-[var(--pms-border)]">
                    <button
                      onClick={() => setColorMode('color')}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer ${
                        colorMode === 'color' ? 'bg-sky-600 text-white' : 'text-[var(--pms-muted)]'
                      }`}
                    >
                      Color
                    </button>
                    <button
                      onClick={() => setColorMode('bw')}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer ${
                        colorMode === 'bw' ? 'bg-sky-600 text-white' : 'text-[var(--pms-muted)]'
                      }`}
                    >
                      B&amp;W
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-bold text-[var(--pms-ink)] gap-2">
                      <span>Shadow Bleach</span>
                      <span className="text-sky-600 dark:text-sky-400 font-mono">{shadowRemoval}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={shadowRemoval}
                      onChange={(e) => setShadowRemoval(Number(e.target.value))}
                      className="w-24 accent-sky-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-bold text-[var(--pms-ink)] gap-2">
                      <span>Sharpness</span>
                      <span className="text-sky-600 dark:text-sky-400 font-mono">{sharpnessLevel.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="2.8"
                      step="0.1"
                      value={sharpnessLevel}
                      onChange={(e) => setSharpnessLevel(Number(e.target.value))}
                      className="w-20 accent-sky-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-bold text-[var(--pms-ink)] gap-2">
                      <span>Paper Bleach</span>
                      <span className="text-sky-600 dark:text-sky-400 font-mono">{paperWhitening}</span>
                    </div>
                    <input
                      type="range"
                      min="165"
                      max="238"
                      step="1"
                      value={paperWhitening}
                      onChange={(e) => setPaperWhitening(Number(e.target.value))}
                      className="w-20 accent-sky-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-bold text-[var(--pms-ink)] gap-2">
                      <span>Ink Darkness</span>
                      <span className="text-sky-600 dark:text-sky-400 font-mono">{inkDarkening}%</span>
                    </div>
                    <input
                      type="range"
                      min="45"
                      max="95"
                      step="5"
                      value={inkDarkening}
                      onChange={(e) => setInkDarkening(Number(e.target.value))}
                      className="w-20 accent-sky-500"
                    />
                  </div>

                  <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer" style={{ color: 'var(--pms-ink)' }}>
                    <input
                      type="checkbox"
                      checked={includeOcr}
                      onChange={(e) => setIncludeOcr(e.target.checked)}
                      className="accent-sky-500 w-3.5 h-3.5 rounded"
                    />
                    <span>Searchable OCR Layer</span>
                  </label>
                </div>

                <button
                  onClick={() => void processPage(file, isImageInput, currentPage)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500/15 border border-sky-500/35 text-sky-700 dark:text-sky-300 font-bold text-xs hover:bg-sky-500/25 cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Apply &amp; Re-Trace
                </button>
              </div>
            </div>

            {/* Split Screen Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="rounded-3xl pms-glass-panel p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-[var(--pms-muted)]">ORIGINAL INPUT (Raster Scan)</span>
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 font-mono text-[10px]">
                    Zoom: {zoomLevel}%
                  </span>
                </div>
                <div className="rounded-2xl overflow-auto border border-[var(--pms-border)] bg-white flex items-start justify-center p-2 max-h-[640px]">
                  <img
                    src={originalImageUrl}
                    alt="Original Scan"
                    style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left' }}
                    className="transition-transform duration-200 rounded-lg shadow-md max-w-none"
                  />
                </div>
              </div>

              <div className="rounded-3xl pms-glass-panel border border-sky-400/50 dark:border-sky-700/60 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-sky-700 dark:text-sky-400 flex items-center gap-1.5">
                    {vectorStats?.isTrueVector ? <PenTool className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {previewMode === 'svg' && svgPreviewUrl
                      ? 'TRUE VECTOR SVG (Infinite Resolution)'
                      : vectorStats?.isTrueVector
                      ? 'TRUE VECTOR BEZIER PDF'
                      : 'TRUEVECTOR 4K (Shadow-Normalized)'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-700 font-mono text-[10px]">
                    Zoom: {zoomLevel}% {vectorStats?.isTrueVector ? '• Zero Pixelation' : ''}
                  </span>
                </div>
                <div className="rounded-2xl overflow-auto border border-sky-200 dark:border-sky-900/40 bg-white flex items-start justify-center p-2 max-h-[640px]">
                  <img
                    src={activeRightSrc}
                    alt="TrueVector Output"
                    style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left' }}
                    className="transition-transform duration-200 rounded-lg shadow-md max-w-none"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <ToolSEOSection
          toolName="TrueVector 4K™"
          headline="Mathematical Bezier Vectorizer & Illumination-Normalized 4K Engine"
          description="Unlike basic contrast filters that leave camera shadows dark and export blurry bitmaps, TrueVector 4K performs LAB morphological background illumination normalization and can trace blueprints, seals, and signatures into true mathematical Cubic Bezier SVG & Vector PDF paths — zooming to 800% with zero pixelation."
          features={[
            { title: 'True Bezier Vector Tracing (.SVG + .PDF)', desc: 'Converts ink layers and blueprints into resolution-independent Cubic Bezier curves with even-odd holes.' },
            { title: 'Morphological Shadow Division', desc: 'Flattens uneven mobile phone lighting and diagonal paper shadows while keeping faded ink intact.' },
            { title: 'Authentic Colored Ink Separation', desc: 'Separates blue ballpoint signatures, red rubber seals, and cyan blueprint strokes from paper grain.' },
            { title: 'RapidOCR Text Indexing', desc: 'Optionally embeds an invisible searchable text layer so scanned documents become selectable.' },
          ]}
        />
      </div>
    </ToolWorkspaceShell>
  );
}
