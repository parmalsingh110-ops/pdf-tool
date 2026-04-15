import React, { useState, useRef, useEffect } from 'react';
import { ScanLine, Download, Loader2, RotateCw, Crop, Activity, Plus, Trash2, CheckCircle2, FileImage } from 'lucide-react';
import { wrapPerspective, type Point } from '../lib/perspectiveWarp';
import { PDFDocument } from 'pdf-lib';

type EnhanceMode = 'document' | 'photo' | 'bw' | 'screen';

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

  useEffect(() => {
    return () => {
      // Cleanup URLs on unmount
      pages.forEach(p => {
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
        enhanceMode: 'document' as EnhanceMode,
        rotation: 0,
        corners: [{x: 10, y: 10}, {x: 90, y: 10}, {x: 90, y: 90}, {x: 10, y: 90}] as [Point, Point, Point, Point]
      };
    });

    setPages(prev => [...prev, ...newPages]);
    setActivePageId(newPages[0].id);
    setStep('crop');
    
    // Load size for active page
    const img = new Image();
    img.onload = () => setOriginalSize({ w: img.naturalWidth, h: img.naturalHeight });
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
        enhanceMode: 'document',
        rotation: 0,
        corners: [{x: 10, y: 10}, {x: 90, y: 10}, {x: 90, y: 90}, {x: 10, y: 90}]
      };
      
      setPages(prev => [...prev, newPage]);
      setActivePageId(newPage.id);
      setStep('crop');
      
      const img = new Image();
      img.onload = () => setOriginalSize({ w: img.naturalWidth, h: img.naturalHeight });
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

      if (mode === 'document' || mode === 'screen') {
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
          // Unsharp mask via blending duplicate layer
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
        const imgBytes = await fetch(p.resultUrl!).then(res => res.arrayBuffer());
        const image = await pdfDoc.embedJpg(imgBytes);
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }
      
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Scanned_Document_${Date.now()}.pdf`;
      a.click();
    } catch {
      alert('Error creating PDF');
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

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Document Scanner Pro</h1>
        <p className="text-slate-500">Scan, crop, and automatically correct multi-page documents.</p>
      </div>

      <div className="w-full max-w-5xl mx-auto flex gap-6 flex-col xl:flex-row items-start">
        <div className="w-full xl:w-64 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col gap-4 sticky top-8">
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Pages ({pages.length})</h3>
          <div className="flex xl:flex-col gap-3 overflow-x-auto xl:overflow-y-auto max-h-[60vh] pb-2 xl:pb-0 scrollbar-hide">
            {pages.map((p, i) => (
              <div 
                key={p.id} 
                onClick={() => switchPage(p.id)}
                className={`flex-shrink-0 relative w-24 xl:w-full aspect-[3/4] rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${activePageId === p.id ? 'border-indigo-500 shadow-md scale-105 xl:scale-100' : 'border-slate-200 hover:border-indigo-300'}`}
              >
                <img src={p.resultUrl || p.originalUrl} className="w-full h-full object-cover" />
                <div className="absolute top-1 left-1 bg-black/50 text-white text-[10px] font-bold px-1.5 rounded">{i + 1}</div>
                {p.resultUrl && <div className="absolute bottom-1 right-1 bg-green-500 text-white p-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /></div>}
                
                <button 
                  onClick={(e) => { e.stopPropagation(); deletePage(p.id); }}
                  className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-500 text-white p-1 rounded opacity-0 hover:opacity-100 transition-opacity xl:group-hover:opacity-100"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            
            <label className="flex-shrink-0 flex flex-col items-center justify-center w-24 xl:w-full aspect-[3/4] border-2 border-dashed border-indigo-200 rounded-xl bg-indigo-50/50 cursor-pointer hover:bg-indigo-50 text-indigo-500 transition-colors">
              <Plus className="w-6 h-6 mb-1" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Add Page</span>
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleFiles} />
            </label>
          </div>
          
          {pages.length > 0 && (
            <button onClick={downloadAllAsPdf} disabled={busy} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold shadow hover:bg-slate-900 mt-2 flex items-center justify-center gap-2">
              <Download className="w-4 h-4"/> Save All PDF
            </button>
          )}
        </div>

        <div className="flex-1 bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 w-full min-h-[500px]">
          {pages.length === 0 && step === 'upload' ? (
            <div className="p-8 sm:p-12 flex flex-col items-center justify-center min-h-[500px]">
              {useCamera ? (
                <div className="space-y-4 max-w-2xl mx-auto w-full">
                  <div className="relative rounded-2xl overflow-hidden bg-black shadow-inner">
                    <video ref={videoRef} autoPlay playsInline className="w-full max-h-[500px]" />
                    <div className="absolute inset-0 border-4 border-dashed border-white/30 m-6 rounded-xl pointer-events-none" />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={capturePhoto} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md">📸 Capture Fast</button>
                    <button onClick={() => { stream?.getTracks().forEach(t => t.stop()); setUseCamera(false); }} className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-300">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 max-w-lg mx-auto w-full">
                  <label className="flex flex-col items-center justify-center w-full h-72 border-2 border-dashed border-indigo-300 rounded-2xl bg-indigo-50/50 cursor-pointer hover:bg-indigo-50 transition-colors">
                    <ScanLine className="w-16 h-16 text-indigo-400 mb-4" />
                    <span className="text-indigo-900 font-bold text-xl">Upload multi-page documents</span>
                    <span className="text-sm text-indigo-400 mt-2">Select multiple JPG, PNG files</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleFiles} />
                  </label>
                  <div className="relative flex items-center justify-center my-4">
                     <div className="absolute border-b border-slate-200 w-full top-1/2"></div>
                     <span className="relative bg-white px-4 text-xs font-bold text-slate-400 uppercase tracking-widest">OR</span>
                  </div>
                  <button onClick={startCamera} className="w-full py-4 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 flex items-center justify-center gap-2 shadow-md text-lg">
                    📷 Open Camera
                  </button>
                </div>
              )}
            </div>
          ) : activePage ? (
            <div className="flex flex-col h-full">
              <div className="flex bg-slate-100 border-b border-slate-200 p-3 sm:p-4 gap-2">
                 <button onClick={() => switchPage(activePage.id, 'crop')} className={`flex-1 text-center py-2 rounded-lg text-sm font-bold transition-colors ${step==='crop' ? 'bg-indigo-500 text-white shadow' : 'text-slate-500 hover:bg-slate-200 cursor-pointer'}`}>1. Accurate Crop</button>
                 <button onClick={() => { if(activePage.croppedUrl) switchPage(activePage.id, 'filter') }} className={`flex-1 text-center py-2 rounded-lg text-sm font-bold transition-colors ${step==='filter' ? 'bg-indigo-500 text-white shadow' : 'text-slate-500 hover:bg-slate-200 font-medium'}`} disabled={!activePage.croppedUrl}>2. Enhance & Filter</button>
              </div>
              
              <div className="p-4 flex-1 flex flex-col justify-center">
                {step === 'crop' && (
                  <div className="flex flex-col items-center space-y-6">
                    <p className="text-slate-600 font-medium">Drag the 4 corners to fit the document bounds exactly.</p>
                    
                    <div 
                      ref={imgContainerRef}
                      className="relative inline-block border border-slate-300 shadow-md touch-none select-none max-w-full"
                      onPointerMove={handleMove}
                      onPointerUp={() => setActivePt(null)}
                      onPointerLeave={() => setActivePt(null)}
                    >
                      <img src={activePage.originalUrl} alt="Crop Source" className="max-h-[60vh] w-auto h-auto block" draggable={false} onDragStart={e => e.preventDefault()} />
                      
                      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{overflow: 'visible'}}>
                         <polygon 
                           points={`${activePage.corners[0].x}%,${activePage.corners[0].y}% ${activePage.corners[1].x}%,${activePage.corners[1].y}% ${activePage.corners[2].x}%,${activePage.corners[2].y}% ${activePage.corners[3].x}%,${activePage.corners[3].y}%`} 
                           fill="rgba(99, 102, 241, 0.2)" 
                           stroke="rgba(99, 102, 241, 0.8)" 
                           strokeWidth="2" 
                         />
                      </svg>

                      {activePage.corners.map((pt, i) => (
                        <div
                          key={i}
                          onPointerDown={(e) => setActivePt(i)}
                          className="absolute w-8 h-8 -ml-4 -mt-4 bg-indigo-600 border-2 border-white rounded-full shadow-lg z-10 cursor-grab active:cursor-grabbing hover:scale-110 transition-transform flex items-center justify-center"
                          style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                        >
                          <div className="w-2 h-2 bg-white rounded-full opacity-50 pointer-events-none"></div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-4">
                      <button onClick={applyCrop} disabled={busy} className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 flex gap-2 items-center">
                         {busy ? <Loader2 className="w-5 h-5 animate-spin"/> : <Crop className="w-5 h-5"/>} Align & Process
                      </button>
                    </div>
                  </div>
                )}
                
                {step === 'filter' && activePage.resultUrl && (
                  <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
                    <div className="flex-1 bg-slate-100 p-4 rounded-xl flex justify-center items-center w-full shadow-inner relative min-h-[50vh]">
                      {busy && (
                        <div className="absolute inset-0 z-10 bg-white/50 flex items-center justify-center backdrop-blur-sm rounded-xl">
                          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                        </div>
                      )}
                      <img src={activePage.resultUrl} alt="Filtered" className="max-h-[65vh] object-contain shadow-md rounded border border-slate-200" />
                    </div>
                    
                    <div className="w-full lg:w-80 space-y-6">
                      <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm space-y-5">
                         <h3 className="font-bold text-slate-800 uppercase text-sm tracking-wider">Enhancement</h3>
                         <div className="grid grid-cols-2 gap-3">
                           {[
                             { id: 'document', label: 'Magic Clean', icon: '📄' },
                             { id: 'bw', label: 'B&W Text', icon: '⬛' },
                             { id: 'screen', label: 'Screen/Monitor', icon: '💻' },
                             { id: 'photo', label: 'Original Photo', icon: '🖼️' },
                           ].map(f => (
                             <button key={f.id} onClick={() => changeFilter(f.id as EnhanceMode)}
                               className={`p-3 rounded-lg flex flex-col items-center gap-1 text-sm font-semibold transition-all ${activePage.enhanceMode === f.id ? 'bg-indigo-600 text-white shadow border-transparent' : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300'}`}>
                               <span className="text-xl">{f.icon}</span>
                               {f.label}
                             </button>
                           ))}
                         </div>
                         {activePage.enhanceMode === 'screen' && (
                           <p className="text-xs text-indigo-600 bg-indigo-50 p-2 rounded block">
                              <Activity className="w-3 h-3 inline mr-1 -mt-0.5" />
                              Removes Moiré patterns and push pixels to pure white.
                           </p>
                         )}
                      </div>

                      <div className="flex gap-2">
                        <button onClick={changeRotation} className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 flex items-center justify-center gap-2">
                           <RotateCw className="w-4 h-4"/> Rotate 90°
                        </button>
                      </div>
                      
                      <button onClick={downloadCurrentAsJpg} className="w-full py-4 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 shadow flex justify-center items-center gap-2">
                         <FileImage className="w-5 h-5"/> Download JPG
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
