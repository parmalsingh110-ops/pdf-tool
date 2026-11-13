import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ScanLine, Download, Loader2, RotateCw, Crop, Activity, Plus, Trash2, CheckCircle2, FileImage, Sparkles, Maximize2, Archive } from 'lucide-react';
import { wrapPerspective, detectDocumentCorners, type Point } from '../lib/perspectiveWarp';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';
import { toArrayBufferBytes, triggerBlobDownload } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

type EnhanceMode = 'magic_color' | 'document' | 'bw' | 'screen' | 'photo';

interface ScannedPage {
  id: string;
  file: File;
  originalUrl: string;
  croppedUrl: string | null;
  resultUrl: string | null;
  enhanceMode: EnhanceMode;
  rotation: number;
  corners: [Point, Point, Point, Point]; // Stored in percentages
}

export default function DocumentScanner() {
  useSEO('Document Scanner Online Free | PDF Media Suite', 'Free online Document Scanner tool. No signup or installation required.');

  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const activePage = pages.find(p => p.id === activePageId);

  // Crop phase
  const [step, setStep] = useState<'upload' | 'crop' | 'filter'>('upload');
  const [activePt, setActivePt] = useState<number | null>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [originalSize, setOriginalSize] = useState<{w: number, h: number} | null>(null);
  const [busy, setBusy] = useState(false);

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null);
  const [useCamera, setUseCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const pagesRef = useRef<ScannedPage[]>(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    return () => {
      // Cleanup URLs on unmount
      pagesRef.current.forEach(p => {
        URL.revokeObjectURL(p.originalUrl);
        if (p.croppedUrl) URL.revokeObjectURL(p.croppedUrl);
        if (p.resultUrl) URL.revokeObjectURL(p.resultUrl);
      });
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    const newPages = files.map(f => {
      const url = URL.createObjectURL(f);
      return {
        id: Date.now().toString() + Math.random().toString(),
        file: f,
        originalUrl: url,
        croppedUrl: null,
        resultUrl: null,
        enhanceMode: 'magic_color' as EnhanceMode,
        rotation: 0,
        corners: [{x: 5, y: 5}, {x: 95, y: 5}, {x: 95, y: 95}, {x: 5, y: 95}] as [Point, Point, Point, Point]
      };
    });

    setPages(prev => [...prev, ...newPages]);
    setActivePageId(newPages[0].id);
    setStep('crop');
    
    // Load size for active page and run automatic edge detection
    const img = new Image();
    img.onload = () => {
      setOriginalSize({ w: img.naturalWidth, h: img.naturalHeight });
      try {
        const detected = detectDocumentCorners(img);
        setPages(prev => prev.map(p => p.id === newPages[0].id ? { ...p, corners: detected } : p));
      } catch (err) {
        console.warn('Auto corner detection fallback:', err);
      }
    };
    img.src = newPages[0].originalUrl;
  };

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
      setStream(s);
      setUseCamera(true);
      setStep('upload');
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 100);
    } catch {
      alert('Camera access denied. Please allow camera permission.');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const f = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
      // Stop camera
      stream?.getTracks().forEach(t => t.stop());
      setStream(null);
      setUseCamera(false);
      
      const newPage: ScannedPage = {
        id: Date.now().toString(),
        file: f,
        originalUrl: URL.createObjectURL(f),
        croppedUrl: null,
        resultUrl: null,
        enhanceMode: 'magic_color',
        rotation: 0,
        corners: [{x: 5, y: 5}, {x: 95, y: 5}, {x: 95, y: 95}, {x: 5, y: 95}]
      };
      
      setPages(prev => [...prev, newPage]);
      setActivePageId(newPage.id);
      setStep('crop');
      
      const img = new Image();
      img.onload = () => {
        setOriginalSize({ w: img.naturalWidth, h: img.naturalHeight });
        try {
          const detected = detectDocumentCorners(img);
          setPages(prev => prev.map(p => p.id === newPage.id ? { ...p, corners: detected } : p));
        } catch (err) {
          console.warn('Auto corner detection fallback:', err);
        }
      };
      img.src = newPage.originalUrl;
    }, 'image/jpeg', 0.95);
  };

  const switchPage = (id: string, forceStep?: 'crop'|'filter') => {
    const p = pages.find(x => x.id === id);
    if (!p) return;
    setActivePageId(id);
    if (forceStep) {
      setStep(forceStep);
    } else {
      setStep(p.resultUrl ? 'filter' : 'crop');
    }
    const img = new Image();
    img.onload = () => setOriginalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = p.originalUrl;
  };

  const deletePage = (id: string) => {
    const pageToDelete = pages.find(p => p.id === id);
    if (pageToDelete) {
      URL.revokeObjectURL(pageToDelete.originalUrl);
      if (pageToDelete.croppedUrl) URL.revokeObjectURL(pageToDelete.croppedUrl);
      if (pageToDelete.resultUrl) URL.revokeObjectURL(pageToDelete.resultUrl);
    }
    const newPages = pages.filter(p => p.id !== id);
    setPages(newPages);
    if (newPages.length === 0) {
      setActivePageId(null);
      setStep('upload');
    } else if (activePageId === id) {
      switchPage(newPages[0].id);
    }
  };

  const updateActivePage = (updates: Partial<ScannedPage>) => {
    setPages(prev => prev.map(p => p.id === activePageId ? { ...p, ...updates } : p));
  };

  const handleAutoDetect = () => {
    if (!activePage) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const corners = detectDocumentCorners(img);
      updateActivePage({ corners });
    };
    img.src = activePage.originalUrl;
  };

  const handleResetCorners = () => {
    if (!activePage) return;
    updateActivePage({
      corners: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    });
  };

  const handleMove = (e: React.PointerEvent) => {
    if (activePt === null || !imgContainerRef.current || !activePage) return;
    const rect = imgContainerRef.current.getBoundingClientRect();
    let cx = ((e.clientX - rect.left) / rect.width) * 100;
    let cy = ((e.clientY - rect.top) / rect.height) * 100;
    cx = Math.max(0, Math.min(100, cx));
    cy = Math.max(0, Math.min(100, cy));
    
    const newPts = [...activePage.corners] as [Point, Point, Point, Point];
    newPts[activePt] = { x: cx, y: cy };
    updateActivePage({ corners: newPts });
  };

  const applyCrop = async () => {
    if (!activePage || !originalSize) return;
    setBusy(true);
    await new Promise(r => setTimeout(r, 50)); 

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = activePage.originalUrl;
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); });

      const absPts: [Point, Point, Point, Point] = [
        { x: (activePage.corners[0].x / 100) * img.naturalWidth, y: (activePage.corners[0].y / 100) * img.naturalHeight },
        { x: (activePage.corners[1].x / 100) * img.naturalWidth, y: (activePage.corners[1].y / 100) * img.naturalHeight },
        { x: (activePage.corners[2].x / 100) * img.naturalWidth, y: (activePage.corners[2].y / 100) * img.naturalHeight },
        { x: (activePage.corners[3].x / 100) * img.naturalWidth, y: (activePage.corners[3].y / 100) * img.naturalHeight },
      ];

      const wTop = Math.hypot(absPts[1].x - absPts[0].x, absPts[1].y - absPts[0].y);
      const wBot = Math.hypot(absPts[2].x - absPts[3].x, absPts[2].y - absPts[3].y);
      const hLeft = Math.hypot(absPts[3].x - absPts[0].x, absPts[3].y - absPts[0].y);
      const hRight = Math.hypot(absPts[2].x - absPts[1].x, absPts[2].y - absPts[1].y);
      const outW = Math.round(Math.max(wTop, wBot));
      const outH = Math.round(Math.max(hLeft, hRight));

      const warpedCanvas = wrapPerspective(img, absPts, outW, outH);
      const blob = await new Promise<Blob|null>(r => warpedCanvas.toBlob(b => r(b), 'image/jpeg', 0.95));
      if (blob) {
        const u = URL.createObjectURL(blob);
        updateActivePage({ croppedUrl: u });
        setStep('filter');
        setTimeout(() => runFilter(u, activePage.enhanceMode, activePage.rotation), 50);
      }
    } catch(e) {
      alert("Crop failed.");
    } finally {
      setBusy(false);
    }
  };

  const runFilter = async (sourceUrl: string, mode: EnhanceMode, rot: number) => {
    setBusy(true);
    await new Promise(r => setTimeout(r, 30));
    try {
      const img = new Image();
      img.src = sourceUrl;
      await new Promise<void>((res) => { img.onload = () => res(); });

      const canvas = document.createElement('canvas');
      const isRotated = rot % 180 !== 0;
      canvas.width = isRotated ? img.naturalHeight : img.naturalWidth;
      canvas.height = isRotated ? img.naturalWidth : img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      const w = canvas.width, h = canvas.height;
      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;

      if (mode === 'magic_color') {
        // CamScanner Pro Magic Color: removes desk shadows, cleans paper to white while keeping vivid stamp/ink color
        let minL = 255, maxL = 0;
        for (let i = 0; i < d.length; i += 16) {
          const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (l < minL) minL = l;
          if (l > maxL) maxL = l;
        }

        const whiteThresh = Math.max(160, maxL * 0.82);
        const blackPoint = minL * 1.15;
        const range = Math.max(1, whiteThresh - blackPoint);

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;

          if (lum >= whiteThresh && sat < 0.2) {
            d[i] = 255;
            d[i + 1] = 255;
            d[i + 2] = 255;
          } else {
            let nr = ((r - blackPoint) / range) * 255;
            let ng = ((g - blackPoint) / range) * 255;
            let nb = ((b - blackPoint) / range) * 255;

            // Preserve colored signatures, seals, and stamps
            if (sat > 0.22) {
              nr = r * 1.08;
              ng = g * 1.08;
              nb = b * 1.08;
            }

            d[i]     = Math.min(255, Math.max(0, nr));
            d[i + 1] = Math.min(255, Math.max(0, ng));
            d[i + 2] = Math.min(255, Math.max(0, nb));
          }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.putImageData(new ImageData(d, w, h), 0, 0);

      } else if (mode === 'document' || mode === 'screen') {
        let minL = 255, maxL = 0;
        for (let i = 0; i < d.length; i += 16) {
          const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (l < minL) minL = l;
          if (l > maxL) maxL = l;
        }
        
        let whitePoint = maxL;
        let blackPoint = minL;

        if (mode === 'screen') {
          // Screen Moiré logic fix: Aggressive push to pure white
          whitePoint = maxL * 0.85; 
          blackPoint = minL + 25;

          ctx.putImageData(imageData, 0, 0);
          ctx.filter = 'blur(2px)';
          ctx.drawImage(canvas, 0, 0);
          ctx.filter = 'none';
          const blurred = ctx.getImageData(0,0,w,h).data;
          for (let i = 0; i < d.length; i++) {
            d[i] = blurred[i];
          }
        } else {
           whitePoint = maxL * 0.85; 
        }

        const range = Math.max(1, whitePoint - blackPoint);
        const scale = 255 / range;

        for (let i = 0; i < d.length; i += 4) {
          let r = (d[i] - blackPoint) * scale;
          let g = (d[i + 1] - blackPoint) * scale;
          let b = (d[i + 2] - blackPoint) * scale;
          
          if (mode === 'screen' && r > 200 && g > 200 && b > 200) {
            r = g = b = 255;
          }

          d[i]     = Math.min(255, Math.max(0, r));
          d[i + 1] = Math.min(255, Math.max(0, g));
          d[i + 2] = Math.min(255, Math.max(0, b));
        }

        if (mode === 'screen') {
          ctx.putImageData(new ImageData(d, w, h), 0, 0);
          ctx.globalCompositeOperation = 'overlay';
          ctx.globalAlpha = 0.3;
          ctx.drawImage(canvas, 0, 0);
          ctx.globalAlpha = 1.0;
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.putImageData(new ImageData(d, w, h), 0, 0);
        }

      } else if (mode === 'bw') {
        let sum = 0, count = 0;
        for (let i = 0; i < d.length; i += 4) {
          sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          count++;
        }
        const threshold = (sum / count) * 0.95; 
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const v = l > threshold ? 255 : 0;
          d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(new ImageData(d, w, h), 0, 0);
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.putImageData(new ImageData(d, w, h), 0, 0);
      }

      const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.92));
      if (blob) {
        const u = URL.createObjectURL(blob);
        updateActivePage({ resultUrl: u, enhanceMode: mode, rotation: rot });
      }
    } catch(e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const changeFilter = (m: EnhanceMode) => {
    if (!activePage?.croppedUrl) return;
    runFilter(activePage.croppedUrl, m, activePage.rotation);
  };

  const changeRotation = () => {
    if (!activePage?.croppedUrl) return;
    const r = (activePage.rotation + 90) % 360;
    runFilter(activePage.croppedUrl, activePage.enhanceMode, r);
  };

  const downloadAllAsPdf = async () => {
    const readyPages = pages.filter(p => p.resultUrl);
    if (readyPages.length === 0) return alert('No processed pages to download.');
    
    setBusy(true);
    try {
      const pdfDoc = await PDFDocument.create();
      
      for (const p of readyPages) {
        const imgBytes = p.resultUrl!.startsWith('data:')
          ? dataUrlToBytes(p.resultUrl!)
          : await fetch(p.resultUrl!).then(res => res.arrayBuffer());
        const image = await pdfDoc.embedJpg(imgBytes);
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }
      
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      triggerBlobDownload(blob, `Scanned_Document_${Date.now()}.pdf`);
    } catch {
      alert('Error creating PDF');
    } finally {
      setBusy(false);
    }
  };

  const downloadAllAsZip = async () => {
    const readyPages = pages.filter(p => p.resultUrl);
    if (readyPages.length === 0) return alert('No processed pages to download.');

    setBusy(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < readyPages.length; i++) {
        const p = readyPages[i];
        const bytes = p.resultUrl!.startsWith('data:')
          ? dataUrlToBytes(p.resultUrl!)
          : await fetch(p.resultUrl!).then(res => res.arrayBuffer());
        zip.file(`Page_${i + 1}_scanned.jpg`, bytes);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerBlobDownload(zipBlob, `Scanned_Pages_${Date.now()}.zip`);
    } catch {
      alert('Error creating ZIP archive');
    } finally {
      setBusy(false);
    }
  };

  const downloadCurrentAsJpg = () => {
    if (!activePage?.resultUrl) return;
    const a = document.createElement('a');
    a.href = activePage.resultUrl;
    a.download = `Scan_${Date.now()}.jpg`;
    a.click();
  };

  const prefersReduced = useReducedMotion();

  return (
    <ToolWorkspaceShell
      title="Document Scanner Pro"
      subtitle="Scan, auto-detect 4-corner perspective, and automatically enhance multi-page documents directly in your browser."
      categoryLabel="Camera & Perspective Scanner"
      icon={ScanLine}
      microVariant="ocr"
      tone="indigo"
      trustNote="Live camera capture · 4-corner perspective warp · Multi-page PDF & ZIP export"
    >
      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="w-full max-w-5xl mx-auto flex gap-6 flex-col xl:flex-row items-start"
      >
        <div className="w-full xl:w-64 pms-glass-panel rounded-3xl p-4 flex flex-col gap-4 sticky top-8">
          <h3 className="font-bold text-sm uppercase tracking-wider flex items-center justify-between" style={{ color: 'var(--pms-ink)' }}>
            <span>Pages</span>
            <span
              className="text-xs px-2.5 py-0.5 rounded-full font-extrabold"
              style={{ backgroundColor: 'var(--pms-soft-lavender)', color: 'var(--pms-violet)' }}
            >
              <AnimatedNumber value={pages.length} />
            </span>
          </h3>
          <div className="flex xl:flex-col gap-3 overflow-x-auto xl:overflow-y-auto max-h-[60vh] pb-2 xl:pb-0 scrollbar-hide">
            {pages.map((p, i) => (
              <div
                key={p.id}
                onClick={() => switchPage(p.id)}
                className={`group flex-shrink-0 relative w-24 xl:w-full aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer border-2 transition-all ${
                  activePageId === p.id
                    ? 'border-[var(--pms-violet)] shadow-md scale-105 xl:scale-100'
                    : 'border-[var(--pms-border)] hover:border-violet-300 dark:hover:border-violet-700'
                }`}
              >
                <img src={p.resultUrl || p.originalUrl} className="w-full h-full object-cover" />
                <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">{i + 1}</div>
                {p.resultUrl && <div className="absolute bottom-1.5 right-1.5 bg-emerald-500 text-white p-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /></div>}

                <button
                  onClick={(e) => { e.stopPropagation(); deletePage(p.id); }}
                  className="absolute top-1.5 right-1.5 bg-rose-500/85 hover:bg-rose-600 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}

            <label
              className="flex-shrink-0 flex flex-col items-center justify-center w-24 xl:w-full aspect-[3/4] border-2 border-dashed border-[var(--pms-border-strong)] rounded-2xl cursor-pointer transition-colors hover:border-[var(--pms-violet)]"
              style={{ backgroundColor: 'var(--pms-soft-lavender)', color: 'var(--pms-violet)' }}
            >
              <Plus className="w-6 h-6 mb-1" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Add Page</span>
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleFiles} />
            </label>
          </div>

          {pages.length > 0 && (
            <div className="space-y-2 mt-2">
              <button onClick={downloadAllAsPdf} disabled={busy} className="w-full py-2.5 pms-btn-primary rounded-xl font-bold flex items-center justify-center gap-2 text-sm cursor-pointer disabled:opacity-50">
                <Download className="w-4 h-4"/> Save All as PDF
              </button>
              <button
                onClick={downloadAllAsZip}
                disabled={busy}
                className="w-full py-2.5 bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] border border-[var(--pms-border)] rounded-xl font-bold hover:opacity-90 flex items-center justify-center gap-2 text-sm cursor-pointer disabled:opacity-50"
              >
                <Archive className="w-4 h-4"/> Download All (ZIP)
              </button>
            </div>
          )}
        </div>

        <div className="relative flex-1 pms-glass-panel rounded-3xl overflow-hidden w-full min-h-[500px]">
          <PearlScanOverlay active={busy} label="Warping perspective & enhancing document…" />

          {pages.length === 0 && step === 'upload' ? (
            <div className="p-8 sm:p-12 flex flex-col items-center justify-center min-h-[500px]">
              {useCamera ? (
                <div className="space-y-4 max-w-2xl mx-auto w-full">
                  <div className="relative rounded-2xl overflow-hidden bg-black shadow-inner border border-[var(--pms-border)]">
                    <video ref={videoRef} autoPlay playsInline className="w-full max-h-[500px]" />
                    <div className="absolute inset-0 border-4 border-dashed border-white/30 m-6 rounded-xl pointer-events-none" />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={capturePhoto} className="flex-1 py-3 pms-btn-primary rounded-2xl font-bold cursor-pointer">📸 Capture Fast</button>
                    <button
                      onClick={() => { stream?.getTracks().forEach(t => t.stop()); setUseCamera(false); }}
                      className="px-6 py-3 border border-[var(--pms-border)] rounded-2xl font-semibold cursor-pointer"
                      style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 max-w-lg mx-auto w-full">
                  <label
                    className="flex flex-col items-center justify-center w-full h-72 border-2 border-dashed border-[var(--pms-border-strong)] rounded-3xl cursor-pointer transition-colors hover:border-[var(--pms-violet)]"
                    style={{ backgroundColor: 'var(--pms-white)' }}
                  >
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                      style={{ backgroundColor: 'var(--pms-soft-lavender)', color: 'var(--pms-violet)' }}
                    >
                      <ScanLine className="w-8 h-8" />
                    </div>
                    <span className="font-bold text-xl" style={{ color: 'var(--pms-ink)' }}>Upload multi-page documents</span>
                    <span className="text-sm mt-2" style={{ color: 'var(--pms-muted)' }}>Select multiple JPG, PNG files</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleFiles} />
                  </label>
                  <div className="relative flex items-center justify-center my-4">
                    <div className="absolute border-b border-[var(--pms-border)] w-full top-1/2"></div>
                    <span
                      className="relative px-4 text-xs font-bold uppercase tracking-widest rounded-full"
                      style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-subtle-text)' }}
                    >
                      OR
                    </span>
                  </div>
                  <button onClick={startCamera} className="w-full py-4 pms-btn-primary rounded-2xl font-bold flex items-center justify-center gap-2 text-lg cursor-pointer">
                    📷 Open Camera
                  </button>
                </div>
              )}
            </div>
          ) : activePage ? (
            <div className="flex flex-col h-full">
              <div className="flex border-b border-[var(--pms-border)] p-3 sm:p-4 gap-2" style={{ backgroundColor: 'var(--pms-pearl)' }}>
                <button
                  onClick={() => switchPage(activePage.id, 'crop')}
                  className={`flex-1 text-center py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                    step === 'crop'
                      ? 'pms-btn-primary shadow'
                      : 'hover:bg-white/60 dark:hover:bg-slate-800/60'
                  }`}
                  style={step === 'crop' ? undefined : { color: 'var(--pms-muted)' }}
                >
                  1. Accurate Crop
                </button>
                <button
                  onClick={() => { if (activePage.croppedUrl) switchPage(activePage.id, 'filter'); }}
                  className={`flex-1 text-center py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer disabled:opacity-40 ${
                    step === 'filter'
                      ? 'pms-btn-primary shadow'
                      : 'hover:bg-white/60 dark:hover:bg-slate-800/60'
                  }`}
                  style={step === 'filter' ? undefined : { color: 'var(--pms-muted)' }}
                  disabled={!activePage.croppedUrl}
                >
                  2. Enhance &amp; Filter
                </button>
              </div>

              <div className="p-4 sm:p-6 flex-1 flex flex-col justify-center">
                {step === 'crop' && (
                  <div className="flex flex-col items-center space-y-6">
                    <p className="font-medium text-sm" style={{ color: 'var(--pms-muted)' }}>Drag the 4 corners to fit the document bounds exactly.</p>

                    <div
                      ref={imgContainerRef}
                      className="relative inline-block border border-[var(--pms-border)] rounded-xl overflow-visible shadow-md touch-none select-none max-w-full"
                      onPointerMove={handleMove}
                      onPointerUp={() => setActivePt(null)}
                      onPointerLeave={() => setActivePt(null)}
                    >
                      <img src={activePage.originalUrl} alt="Crop Source" className="max-h-[60vh] w-auto h-auto block rounded-xl" draggable={false} onDragStart={e => e.preventDefault()} />

                      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                        <polygon
                          points={`${activePage.corners[0].x}%,${activePage.corners[0].y}% ${activePage.corners[1].x}%,${activePage.corners[1].y}% ${activePage.corners[2].x}%,${activePage.corners[2].y}% ${activePage.corners[3].x}%,${activePage.corners[3].y}%`}
                          fill="rgba(124, 58, 237, 0.2)"
                          stroke="rgba(124, 58, 237, 0.85)"
                          strokeWidth="2"
                        />
                      </svg>

                      {activePage.corners.map((pt, i) => (
                        <div
                          key={i}
                          onPointerDown={() => setActivePt(i)}
                          className="absolute w-8 h-8 -ml-4 -mt-4 bg-[var(--pms-violet)] border-2 border-white rounded-full shadow-lg z-10 cursor-grab active:cursor-grabbing hover:scale-110 transition-transform flex items-center justify-center"
                          style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                        >
                          <div className="w-2 h-2 bg-white rounded-full opacity-60 pointer-events-none"></div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button onClick={handleAutoDetect} className="px-4 py-2.5 bg-[var(--pms-soft-rose)] border border-[var(--pms-border)] text-amber-800 dark:text-amber-300 font-bold rounded-xl hover:opacity-90 flex items-center gap-2 text-sm shadow-sm cursor-pointer">
                        <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span>Auto Detect Edges</span>
                      </button>
                      <button
                        onClick={handleResetCorners}
                        className="px-4 py-2.5 border border-[var(--pms-border)] font-bold rounded-xl hover:border-violet-300 flex items-center gap-2 text-sm shadow-sm cursor-pointer"
                        style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                      >
                        <Maximize2 className="w-4 h-4" style={{ color: 'var(--pms-muted)' }} />
                        <span>Full Image</span>
                      </button>
                      <button onClick={applyCrop} disabled={busy} className="px-6 py-2.5 pms-btn-primary font-bold rounded-xl flex gap-2 items-center notranslate text-sm cursor-pointer disabled:opacity-50" translate="no">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Crop className="w-4 h-4"/>}
                        <span>Align &amp; Process</span>
                      </button>
                    </div>
                  </div>
                )}

                {step === 'filter' && activePage.resultUrl && (
                  <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
                    <div className="flex-1 bg-slate-100 dark:bg-slate-950 p-4 rounded-2xl flex justify-center items-center w-full shadow-inner relative min-h-[50vh] border border-[var(--pms-border)]">
                      {busy && (
                        <div className="absolute inset-0 z-10 bg-white/50 dark:bg-slate-900/60 flex items-center justify-center backdrop-blur-sm rounded-2xl">
                          <Loader2 className="w-10 h-10 text-[var(--pms-violet)] animate-spin" />
                        </div>
                      )}
                      <img src={activePage.resultUrl} alt="Filtered" className="max-h-[65vh] object-contain shadow-md rounded border border-slate-200 dark:border-slate-700 bg-white" />
                    </div>

                    <div className="w-full lg:w-80 space-y-5">
                      <div className="p-5 rounded-2xl border border-[var(--pms-border)] shadow-sm space-y-4" style={{ backgroundColor: 'var(--pms-pearl)' }}>
                        <h3 className="font-bold uppercase text-sm tracking-wider" style={{ color: 'var(--pms-ink)' }}>Enhancement</h3>
                        <div className="grid grid-cols-2 gap-2.5">
                          {[
                            { id: 'magic_color', label: 'Magic Color', icon: '✨', desc: 'CamScanner Pro' },
                            { id: 'document', label: 'Magic Clean', icon: '📄', desc: 'Whitened' },
                            { id: 'bw', label: 'B&W Text', icon: '⬛', desc: 'High Contrast' },
                            { id: 'screen', label: 'Screen/Monitor', icon: '💻', desc: 'Anti-Moiré' },
                            { id: 'photo', label: 'Original Photo', icon: '🖼️', desc: 'Untouched' },
                          ].map(f => (
                            <button
                              key={f.id}
                              onClick={() => changeFilter(f.id as EnhanceMode)}
                              className={`p-2.5 rounded-xl flex flex-col items-center gap-0.5 text-xs font-semibold transition-all cursor-pointer border ${
                                activePage.enhanceMode === f.id
                                  ? 'pms-btn-primary border-transparent shadow'
                                  : 'border-[var(--pms-border)] hover:border-violet-300 dark:hover:border-violet-700'
                              }`}
                              style={activePage.enhanceMode === f.id ? undefined : { backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                            >
                              <span className="text-lg">{f.icon}</span>
                              <span className="font-bold">{f.label}</span>
                              <span
                                className="text-[10px]"
                                style={{ color: activePage.enhanceMode === f.id ? 'rgba(255,255,255,0.82)' : 'var(--pms-subtle-text)' }}
                              >
                                {f.desc}
                              </span>
                            </button>
                          ))}
                        </div>
                        <AnimatePresence>
                          {activePage.enhanceMode === 'screen' && (
                            <motion.p
                              initial={prefersReduced ? false : { opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={prefersReduced ? undefined : { opacity: 0 }}
                              className="text-xs text-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] p-2.5 rounded-xl block"
                            >
                              <Activity className="w-3 h-3 inline mr-1 -mt-0.5" />
                              Removes Moiré patterns and push pixels to pure white.
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={changeRotation}
                          className="flex-1 py-3 border border-[var(--pms-border)] font-bold rounded-xl hover:border-violet-300 flex items-center justify-center gap-2 cursor-pointer"
                          style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                        >
                          <RotateCw className="w-4 h-4"/> Rotate 90°
                        </button>
                      </div>

                      <button onClick={downloadCurrentAsJpg} className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 flex justify-center items-center gap-2 cursor-pointer transition-colors">
                        <FileImage className="w-5 h-5"/> Download JPG
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>
    </ToolWorkspaceShell>
  );
}
