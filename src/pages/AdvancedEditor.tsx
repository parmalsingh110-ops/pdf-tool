import { useState, useRef, useEffect, useCallback } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker } from 'tesseract.js';
import { 
  Type, 
  Square, 
  Highlighter, 
  PenTool, 
  Link as LinkIcon, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  X,
  MousePointer2,
  Table,
  Bold,
  Italic,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo,
  Pencil,
  Loader2,
  Move,
  ScanText,
  ImagePlus,
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import FileDropzone from '../components/FileDropzone';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Tool = 'select' | 'text' | 'whiteout' | 'highlight' | 'signature' | 'link' | 'table' | 'freehand' | 'image' | null;

interface Annotation {
  id: string;
  type: Tool;
  pageIndex: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  color?: string;
  /** PDF output uses Standard Helvetica variants (embedded). */
  bold?: boolean;
  italic?: boolean;
  rows?: number;
  cols?: number;
  tableData?: string[][];
  signatureDataUrl?: string;
  url?: string;
  /** Freehand drawing SVG path data */
  pathData?: string;
  strokeWidth?: number;
  /** Inserted image data URL */
  imageDataUrl?: string;
}

export default function AdvancedEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageViewport, setPageViewport] = useState<pdfjsLib.PageViewport | null>(null);
  
  const [activeTool, setActiveTool] = useState<Tool>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detectedText, setDetectedText] = useState<{text: string, x: number, y: number, w: number, h: number}[]>([]);
  
  // Property states (defaults for newly placed text)
  const [fontSize, setFontSize] = useState(14);
  const [textColor, setTextColor] = useState('#000000');
  const [defaultBold, setDefaultBold] = useState(false);
  const [defaultItalic, setDefaultItalic] = useState(false);

  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [pendingLinkRect, setPendingLinkRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [editedUrl, setEditedUrl] = useState<string | null>(null);

  // === NEW: Zoom ===
  const [zoomLevel, setZoomLevel] = useState(1.5);

  // === NEW: Undo/Redo ===
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);

  // === NEW: Drag move ===
  const [isDragging, setIsDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // === NEW: Freehand ===
  const [freehandPoints, setFreehandPoints] = useState<{x: number, y:number}[]>([]);
  const [freehandColor, setFreehandColor] = useState('#000000');
  const [freehandWidth, setFreehandWidth] = useState(2);

  // === NEW: Resize for image/signature annotations ===
  const resizeAnnRef = useRef<{ id: string; handle: string; startX: number; startY: number; startAnnX: number; startAnnY: number; startW: number; startH: number } | null>(null);

  // === NEW: OCR for scanned PDFs ===
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrDone, setOcrDone] = useState(false);
  const [isScannedPdf, setIsScannedPdf] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const sigCanvasRef = useRef<SignatureCanvas>(null);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setEditedUrl(null);
      setAnnotations([]);
      setDetectedText([]);
      setUndoStack([]);
      setRedoStack([]);
      setOcrDone(false);
      setIsScannedPdf(false);
      
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setCurrentPage(1);
      } catch (error) {
        console.error("Error loading PDF:", error);
      }
    }
  };

  // === Undo/Redo helpers ===
  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-30), annotations.map(a => ({...a}))]);
    setRedoStack([]);
  }, [annotations]);

  const doUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, annotations.map(a => ({...a}))]);
    setUndoStack(s => s.slice(0, -1));
    setAnnotations(prev);
    setSelectedId(null);
  }, [undoStack, annotations]);

  const doRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(s => [...s, annotations.map(a => ({...a}))]);
    setRedoStack(r => r.slice(0, -1));
    setAnnotations(next);
    setSelectedId(null);
  }, [redoStack, annotations]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); doRedo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); doRedo(); }
      if (e.key === 'Delete' && selectedId) { pushUndo(); deleteAnnotation(selectedId); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doUndo, doRedo, selectedId, pushUndo]);

  useEffect(() => {
    if (pdfDoc) {
      renderPage(currentPage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, currentPage, zoomLevel]);

  const renderPage = async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return;
    
    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: zoomLevel });
      setPageViewport(viewport);
      
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas
        }).promise;
      }

      // Text detection for editing
      const textContent = await page.getTextContent();
      const items = textContent.items.map((item: any) => {
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        return {
          text: item.str,
          x: tx[4],
          y: tx[5] - item.height * viewport.scale,
          w: item.width * viewport.scale,
          h: item.height * viewport.scale
        };
      }).filter(i => i.text.trim().length > 0);

      setDetectedText(items);

      // If very few text items found, it's likely a scanned PDF
      const hasText = items.filter(i => i.w > 2 && i.h > 2).length > 3;
      setIsScannedPdf(!hasText);
    } catch (error) {
      console.error("Error rendering page:", error);
    }
  };

  // === NEW: OCR fallback for scanned PDFs ===
  const runOcrOnPage = async () => {
    if (!canvasRef.current) return;
    setOcrBusy(true);
    try {
      const canvas = canvasRef.current;
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
      if (!blob) throw new Error('Canvas export failed');
      
      const worker = await createWorker('eng');
      const { data } = await worker.recognize(blob, {}, { blocks: true });
      await worker.terminate();

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const imgData = ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height).data : null;

      const ocrItems: {text: string, x: number, y: number, w: number, h: number, fgColor: string, bgColor: string}[] = [];
      if (data.blocks) {
        for (const block of data.blocks) {
          for (const para of block.paragraphs || []) {
            for (const line of para.lines || []) {
              const t = (line.text || '').trim();
              if (!t) continue;
              const b = line.bbox;
              if (!b || b.x1 <= b.x0 || b.y1 <= b.y0) continue;
              const x = Math.floor(b.x0);
              const y = Math.floor(b.y0);
              const w = Math.floor(b.x1 - b.x0);
              const h = Math.floor(b.y1 - b.y0);

              let fgColor = '#000000';
              let bgColor = '#ffffff';

              if (imgData && w > 0 && h > 0) {
                let minL = 255, maxL = 0;
                let fgR=0, fgG=0, fgB=0;
                let bgR=255, bgG=255, bgB=255;
                let bgSumR=0, bgSumG=0, bgSumB=0, bgCount=0;

                for (let py = y; py < y + h; py++) {
                  for (let px = x; px < x + w; px++) {
                    const i = (py * canvas.width + px) * 4;
                    if (i >= 0 && i < imgData.length) {
                      const r = imgData[i], g = imgData[i+1], b = imgData[i+2];
                      const l = 0.299*r + 0.587*g + 0.114*b;
                      if (l < minL) { minL = l; fgR=r; fgG=g; fgB=b; }
                      if (l > maxL) { maxL = l; bgR=r; bgG=g; bgB=b; }
                      if (l > 150) { bgSumR+=r; bgSumG+=g; bgSumB+=b; bgCount++; }
                    }
                  }
                }
                fgColor = `#${((1<<24)+(fgR<<16)+(fgG<<8)+fgB).toString(16).slice(1)}`;
                if (bgCount > 0) {
                   bgColor = `#${((1<<24)+(Math.round(bgSumR/bgCount)<<16)+(Math.round(bgSumG/bgCount)<<8)+Math.round(bgSumB/bgCount)).toString(16).slice(1)}`;
                } else {
                   bgColor = `#${((1<<24)+(bgR<<16)+(bgG<<8)+bgB).toString(16).slice(1)}`;
                }
              }

              ocrItems.push({
                text: t,
                x: b.x0,
                y: b.y0,
                w,
                h,
                fgColor,
                bgColor
              });
            }
          }
        }
      }
      setDetectedText(ocrItems);
      setOcrDone(true);
      setIsScannedPdf(ocrItems.length > 0);
    } catch (e) {
      console.error('OCR failed:', e);
      alert('OCR failed. Please try again.');
    } finally {
      setOcrBusy(false);
    }
  };

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    if (!overlayRef.current) return;
    
    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // If no tool is active, check if we're clicking on an annotation to drag
    if (!activeTool) {
      const clickedAnn = [...annotations].reverse().find(a =>
        a.pageIndex === currentPage - 1 &&
        x >= a.x && x <= a.x + (a.width || 100) &&
        y >= a.y && y <= a.y + (a.height || 24)
      );
      if (clickedAnn) {
        setSelectedId(clickedAnn.id);
        setIsDragging(true);
        setDragTarget(clickedAnn.id);
        setDragOffset({ x: x - clickedAnn.x, y: y - clickedAnn.y });
        pushUndo();
        e.preventDefault();
        return;
      }
      return;
    }

    if (activeTool === 'select') {
      // Check if we clicked on a detected text block
      const clickedText = detectedText.find(t => 
        x >= t.x && x <= t.x + t.w && 
        y >= t.y && y <= t.y + t.h
      );

      if (clickedText) {
        pushUndo();
        const id = Date.now().toString();
        const pad = 4;
        const whiteout: Annotation = {
          id: id + '_w',
          type: 'whiteout',
          pageIndex: currentPage - 1,
          x: clickedText.x - pad,
          y: clickedText.y - pad,
          width: clickedText.w + pad * 2,
          height: clickedText.h + pad * 2,
          color: clickedText.bgColor || '#ffffff'
        };
        const textAnn: Annotation = {
          id: id + '_t',
          type: 'text',
          pageIndex: currentPage - 1,
          x: clickedText.x,
          y: clickedText.y,
          width: clickedText.w,
          height: clickedText.h,
          text: clickedText.text,
          fontSize: Math.max(10, Math.round(clickedText.h * 0.7)),
          color: clickedText.fgColor || '#000000',
          bold: defaultBold,
          italic: defaultItalic,
        };
        setAnnotations(prev => [...prev, whiteout, textAnn]);
        setSelectedId(textAnn.id);
        setActiveTool(null);
      }
    } else if (activeTool === 'text') {
      pushUndo();
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: 'text',
        pageIndex: currentPage - 1,
        x,
        y,
        width: 200,
        height: Math.max(24, fontSize + 8),
        text: 'New Text',
        fontSize,
        color: textColor,
        bold: defaultBold,
        italic: defaultItalic,
      };
      setAnnotations(prev => [...prev, newAnnotation]);
      setSelectedId(newAnnotation.id);
      setActiveTool(null);
    } else if (activeTool === 'freehand') {
      setIsDrawing(true);
      setFreehandPoints([{ x, y }]);
    } else if (['whiteout', 'highlight', 'link', 'table'].includes(activeTool!)) {
      setIsDrawing(true);
      setStartPos({ x, y });
      setCurrentRect({ x, y, w: 0, h: 0 });
    } else if (activeTool === 'signature') {
      setShowSignatureModal(true);
      setStartPos({ x, y });
    }
  };

  const handleOverlayMouseMove = (e: React.MouseEvent) => {
    if (!overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    // Handle drag move
    if (isDragging && dragTarget) {
      setAnnotations(prev => prev.map(a =>
        a.id === dragTarget
          ? { ...a, x: currentX - dragOffset.x, y: currentY - dragOffset.y }
          : a
      ));
      return;
    }

    // Freehand drawing
    if (isDrawing && activeTool === 'freehand') {
      setFreehandPoints(prev => [...prev, { x: currentX, y: currentY }]);
      return;
    }
    
    if (!isDrawing || !currentRect) return;
    
    setCurrentRect({
      x: Math.min(startPos.x, currentX),
      y: Math.min(startPos.y, currentY),
      w: Math.abs(currentX - startPos.x),
      h: Math.abs(currentY - startPos.y)
    });
  };

  const handleOverlayMouseUp = () => {
    // End drag
    if (isDragging && dragTarget) {
      setIsDragging(false);
      setDragTarget(null);
      return;
    }

    // End freehand
    if (isDrawing && activeTool === 'freehand' && freehandPoints.length > 2) {
      pushUndo();
      const path = freehandPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const xs = freehandPoints.map(p => p.x);
      const ys = freehandPoints.map(p => p.y);
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: 'freehand',
        pageIndex: currentPage - 1,
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        pathData: path,
        color: freehandColor,
        strokeWidth: freehandWidth,
      };
      setAnnotations(prev => [...prev, newAnnotation]);
      setFreehandPoints([]);
      setIsDrawing(false);
      return;
    }

    if (!isDrawing || !currentRect) {
      setIsDrawing(false);
      setFreehandPoints([]);
      return;
    }
    
    setIsDrawing(false);
    
    if (currentRect.w > 5 && currentRect.h > 5) {
      pushUndo();
      if (activeTool === 'link') {
        setPendingLinkRect(currentRect);
        setShowLinkModal(true);
      } else if (activeTool === 'table') {
        const newAnnotation: Annotation = {
          id: Date.now().toString(),
          type: 'table',
          pageIndex: currentPage - 1,
          x: currentRect.x,
          y: currentRect.y,
          width: currentRect.w,
          height: currentRect.h,
          rows: 3,
          cols: 3,
          tableData: [['', '', ''], ['', '', ''], ['', '', '']]
        };
        setAnnotations(prev => [...prev, newAnnotation]);
        setSelectedId(newAnnotation.id);
      } else {
        const newAnnotation: Annotation = {
          id: Date.now().toString(),
          type: activeTool,
          pageIndex: currentPage - 1,
          x: currentRect.x,
          y: currentRect.y,
          width: currentRect.w,
          height: currentRect.h
        };
        setAnnotations(prev => [...prev, newAnnotation]);
        setSelectedId(newAnnotation.id);
      }
    }
    setCurrentRect(null);
    setActiveTool(null);
  };

  const saveSignature = () => {
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      pushUndo();
      const dataUrl = sigCanvasRef.current.getTrimmedCanvas().toDataURL('image/png');
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: 'signature',
        pageIndex: currentPage - 1,
        x: startPos.x,
        y: startPos.y,
        width: 150,
        height: 50,
        signatureDataUrl: dataUrl
      };
      setAnnotations(prev => [...prev, newAnnotation]);
      setShowSignatureModal(false);
      setActiveTool(null);
    }
  };

  const saveLink = () => {
    if (pendingLinkRect && linkUrl) {
      pushUndo();
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: 'link',
        pageIndex: currentPage - 1,
        x: pendingLinkRect.x,
        y: pendingLinkRect.y,
        width: pendingLinkRect.w,
        height: pendingLinkRect.h,
        url: linkUrl
      };
      setAnnotations(prev => [...prev, newAnnotation]);
    }
    setShowLinkModal(false);
    setPendingLinkRect(null);
    setLinkUrl('');
    setActiveTool(null);
  };

  const updateAnnotation = (id: string, updates: Partial<Annotation>) => {
    setAnnotations(annotations.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const updateAnnotationText = (id: string, text: string) => {
    updateAnnotation(id, { text });
  };

  const selectedTextAnn = annotations.find((a) => a.id === selectedId && a.type === 'text');

  const updateTableData = (id: string, r: number, c: number, value: string) => {
    setAnnotations(annotations.map(a => {
      if (a.id === id && a.tableData) {
        const newData = [...a.tableData.map(row => [...row])];
        newData[r][c] = value;
        return { ...a, tableData: newData };
      }
      return a;
    }));
  };
  const deleteAnnotation = (id: string) => {
    setAnnotations(annotations.filter(a => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    } : { r: 0, g: 0, b: 0 };
  };

  const toggleBoldForText = () => {
    if (selectedTextAnn) {
      updateAnnotation(selectedTextAnn.id, { bold: !selectedTextAnn.bold });
    } else {
      setDefaultBold((b) => !b);
    }
  };

  const toggleItalicForText = () => {
    if (selectedTextAnn) {
      updateAnnotation(selectedTextAnn.id, { italic: !selectedTextAnn.italic });
    } else {
      setDefaultItalic((i) => !i);
    }
  };

  const applyChangesAndSave = async () => {
    if (!file || !pageViewport) return;
    
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const helveticaFont = await pdf.embedFont(StandardFonts.Helvetica);
      const helveticaOblique = await pdf.embedFont(StandardFonts.HelveticaOblique);
      const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const helveticaBoldOblique = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);

      const resolveTextFont = (bold?: boolean, italic?: boolean) => {
        if (bold && italic) return helveticaBoldOblique;
        if (bold) return helveticaBold;
        if (italic) return helveticaOblique;
        return helveticaFont;
      };
      
      const pages = pdf.getPages();
      
      for (const ann of annotations) {
        const page = pages[ann.pageIndex];
        if (!page) continue;
        const { height: pageHeight } = page.getSize();
        
        const scale = pageViewport.scale;
        const pdfX = ann.x / scale;
        const pdfY = pageHeight - (ann.y / scale);
        const pdfW = (ann.width || 0) / scale;
        const pdfH = (ann.height || 0) / scale;

        if (ann.type === 'text' && ann.text) {
          const { r, g, b } = hexToRgb(ann.color || '#000000');
          const font = resolveTextFont(ann.bold, ann.italic);
          page.drawText(ann.text, {
            x: pdfX,
            y: pdfY - ((ann.fontSize || 14) / scale),
            size: (ann.fontSize || 14) / scale,
            font,
            color: rgb(r, g, b),
          });
        } else if (ann.type === 'table' && ann.tableData && ann.rows && ann.cols) {
          const cellW = pdfW / ann.cols;
          const cellH = pdfH / ann.rows;

          ann.tableData.forEach((row, ri) => {
            row.forEach((cell, ci) => {
              const cx = pdfX + (ci * cellW);
              const cy = pdfY - ((ri + 1) * cellH);
              
              page.drawRectangle({
                x: cx,
                y: cy,
                width: cellW,
                height: cellH,
                borderWidth: 1 / scale,
                borderColor: rgb(0.8, 0.8, 0.8),
                color: rgb(1, 1, 1),
              });

              if (cell) {
                page.drawText(cell, {
                  x: cx + (2 / scale),
                  y: cy + (cellH / 4),
                  size: 8 / scale,
                  font: helveticaFont,
                  color: rgb(0, 0, 0),
                });
              }
            });
          });
        } else if (ann.type === 'whiteout') {
          const { r, g, b } = hexToRgb(ann.color || '#ffffff');
          const padding = 2 / scale;
          page.drawRectangle({
            x: pdfX - padding,
            y: pdfY - pdfH - padding,
            width: pdfW + (padding * 2),
            height: pdfH + (padding * 2),
            color: rgb(r, g, b),
          });
        } else if (ann.type === 'highlight') {
          page.drawRectangle({
            x: pdfX,
            y: pdfY - pdfH,
            width: pdfW,
            height: pdfH,
            color: rgb(1, 1, 0),
            opacity: 0.4,
          });
        } else if (ann.type === 'signature' && ann.signatureDataUrl) {
          const imgBytes = await fetch(ann.signatureDataUrl).then(res => res.arrayBuffer());
          const pdfImage = await pdf.embedPng(imgBytes);
          page.drawImage(pdfImage, {
            x: pdfX,
            y: pdfY - pdfH,
            width: pdfW,
            height: pdfH,
          });
        } else if (ann.type === 'image' && ann.imageDataUrl) {
          const imgBytes = await fetch(ann.imageDataUrl).then(res => res.arrayBuffer());
          let pdfImage;
          if (ann.imageDataUrl.includes('image/png')) {
            pdfImage = await pdf.embedPng(imgBytes);
          } else {
            pdfImage = await pdf.embedJpg(imgBytes);
          }
          page.drawImage(pdfImage, {
            x: pdfX,
            y: pdfY - pdfH,
            width: pdfW,
            height: pdfH,
          });
        } else if (ann.type === 'freehand' && ann.pathData) {
          // Freehand: draw as a series of thin lines
          const { r, g, b } = hexToRgb(ann.color || '#000000');
          const parts = ann.pathData.split(/\s+/);
          let prevX = 0, prevY = 0;
          for (const part of parts) {
            const cmd = part[0];
            const coords = part.slice(1).split(',').map(Number);
            const px = coords[0] / scale;
            const py = pageHeight - (coords[1] / scale);
            if (cmd === 'L' && prevX !== 0) {
              page.drawLine({
                start: { x: prevX, y: prevY },
                end: { x: px, y: py },
                thickness: (ann.strokeWidth || 2) / scale,
                color: rgb(r, g, b),
              });
            }
            prevX = px;
            prevY = py;
          }
        } else if (ann.type === 'link' && ann.url) {
          const linkAnnotation = pdf.context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: [pdfX, pdfY - pdfH, pdfX + pdfW, pdfY],
            Border: [0, 0, 0],
            A: {
              Type: 'Action',
              S: 'URI',
              URI: pdf.context.obj(ann.url),
            },
          });
          
          let annots = page.node.Annots();
          if (!annots) {
            annots = pdf.context.obj([]);
            page.node.set(pdf.context.obj('Annots'), annots);
          }
          // @ts-ignore
          annots.push(linkAnnotation);
        }
      }

      const pdfBytes = await pdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setEditedUrl(url);
    } catch (error) {
      console.error("Error saving PDF:", error);
      alert("An error occurred while saving the PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const toolButton = (tool: Tool, icon: React.ReactNode, label: string, title?: string) => (
    <button
      onClick={() => setActiveTool(activeTool === tool ? null : tool)}
      className={`p-2 rounded-lg flex items-center gap-2 transition-colors ${activeTool === tool ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
      title={title || label}
    >
      {icon}
      <span className="hidden sm:inline text-sm font-medium">{label}</span>
    </button>
  );

  return (
    <div className="flex-1 flex flex-col bg-gray-100">
      {!file ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-3xl">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">Advanced PDF Editor</h1>
              <p className="text-xl text-gray-600">Add text, whiteout, highlights, signatures, freehand draw, links, and more.</p>
            </div>
            <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
          </div>
        </div>
      ) : !editedUrl ? (
        <div className="flex-1 flex flex-col h-full">
          {/* Toolbar */}
          <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm z-10 flex-wrap gap-2">
            <div className="flex items-center gap-1 flex-wrap">
              {toolButton('select', <MousePointer2 className="w-5 h-5" />, 'Select', 'Select & Edit Existing Text (click on text in the PDF)')}
              <div className="w-px h-6 bg-gray-200 mx-1"></div>
              {toolButton('text', <Type className="w-5 h-5" />, 'Text', 'Add New Text')}
              <button
                type="button"
                onClick={toggleBoldForText}
                className={`p-2 rounded-lg flex items-center gap-1 transition-colors ${
                  (selectedTextAnn ? !!selectedTextAnn.bold : defaultBold)
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title="Bold"
              >
                <Bold className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={toggleItalicForText}
                className={`p-2 rounded-lg flex items-center gap-1 transition-colors ${
                  (selectedTextAnn ? !!selectedTextAnn.italic : defaultItalic)
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title="Italic"
              >
                <Italic className="w-5 h-5" />
              </button>
              {toolButton('table', <Table className="w-5 h-5" />, 'Table', 'Add Table')}
              {toolButton('whiteout', <Square className="w-5 h-5" />, 'Whiteout')}
              {toolButton('highlight', <Highlighter className="w-5 h-5" />, 'Highlight')}
              {toolButton('freehand', <Pencil className="w-5 h-5" />, 'Draw', 'Freehand Draw')}
              <button
                type="button"
                onClick={() => { setActiveTool('signature'); setStartPos({x: 200, y: 300}); setShowSignatureModal(true); }}
                className={`p-2 rounded-lg flex items-center gap-1 cursor-pointer transition-colors ${activeTool === 'signature' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                title="Sign"
              >
                <PenTool className="w-5 h-5" />
                <span className="text-xs font-medium hidden md:inline">Sign</span>
              </button>
              {toolButton('link', <LinkIcon className="w-5 h-5" />, 'Link')}
              {/* Insert Image */}
              <label
                className={`p-2 rounded-lg flex items-center gap-1 cursor-pointer transition-colors text-gray-600 hover:bg-gray-100`}
                title="Insert Image"
              >
                <ImagePlus className="w-5 h-5" />
                <span className="text-xs font-medium hidden md:inline">Image</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const dataUrl = reader.result as string;
                    const tempImg = new Image();
                    tempImg.onload = () => {
                      pushUndo();
                      const maxW = 200;
                      const scale = Math.min(maxW / tempImg.naturalWidth, 1);
                      const newAnnotation: Annotation = {
                        id: Date.now().toString(),
                        type: 'image',
                        pageIndex: currentPage - 1,
                        x: 50,
                        y: 50,
                        width: tempImg.naturalWidth * scale,
                        height: tempImg.naturalHeight * scale,
                        imageDataUrl: dataUrl,
                      };
                      setAnnotations(prev => [...prev, newAnnotation]);
                      setSelectedId(newAnnotation.id);
                    };
                    tempImg.src = dataUrl;
                  };
                  reader.readAsDataURL(f);
                }} />
              </label>
              <div className="w-px h-6 bg-gray-200 mx-1"></div>
              {/* Undo / Redo */}
              <button onClick={doUndo} disabled={undoStack.length === 0} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30" title="Undo (Ctrl+Z)">
                <Undo2 className="w-5 h-5" />
              </button>
              <button onClick={doRedo} disabled={redoStack.length === 0} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30" title="Redo (Ctrl+Shift+Z)">
                <Redo className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex items-center gap-3 flex-wrap">
              {/* Zoom */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <button onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))} className="p-1 rounded hover:bg-white" title="Zoom out">
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium px-2 min-w-[3rem] text-center">{Math.round(zoomLevel * 100)}%</span>
                <button onClick={() => setZoomLevel(z => Math.min(3, z + 0.25))} className="p-1 rounded hover:bg-white" title="Zoom in">
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
              {/* Page nav */}
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                <button 
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded hover:bg-white disabled:opacity-50"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm font-medium px-2">{currentPage} / {numPages}</span>
                <button 
                  onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
                  disabled={currentPage === numPages}
                  className="p-1 rounded hover:bg-white disabled:opacity-50"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              {/* OCR button for scanned PDFs */}
              {isScannedPdf && !ocrDone && (
                <button
                  onClick={runOcrOnPage}
                  disabled={ocrBusy}
                  className="px-3 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm font-bold hover:bg-amber-200 disabled:opacity-50 flex items-center gap-2"
                  title="Scanned PDF detected. Run OCR to detect text."
                >
                  {ocrBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanText className="w-4 h-4" />}
                  {ocrBusy ? 'OCR running…' : 'Scan Text (OCR)'}
                </button>
              )}
              <button
                onClick={applyChangesAndSave}
                disabled={isProcessing}
                className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isProcessing ? 'Saving...' : 'Apply Changes'}
              </button>
            </div>
          </div>

          {/* Scanned PDF notice */}
          {isScannedPdf && !ocrDone && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800 flex items-center gap-2">
              <ScanText className="w-4 h-4 shrink-0" />
              <span>This looks like a <strong>scanned/image-based PDF</strong>. Click "Scan Text (OCR)" to detect text for editing.</span>
            </div>
          )}

          {/* Editor Layout: Canvas + Sidebar */}
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-auto p-8 flex justify-center bg-gray-200" onClick={() => setSelectedId(null)}>
              <div 
                className="relative shadow-xl bg-white" 
                style={{ width: pageViewport?.width, height: pageViewport?.height }}
                onClick={(e) => e.stopPropagation()}
              >
                <canvas ref={canvasRef} className="absolute top-0 left-0" />
                
                {/* Interactive Overlay */}
                <div 
                  ref={overlayRef}
                  className={`absolute top-0 left-0 w-full h-full z-10 ${
                    activeTool === 'freehand' ? 'cursor-crosshair' : 
                    activeTool ? 'cursor-crosshair' :
                    isDragging ? 'cursor-grabbing' : ''
                  }`}
                  onMouseDown={handleOverlayMouseDown}
                  onMouseMove={(e) => {
                    handleOverlayMouseMove(e);
                    if (resizeAnnRef.current) {
                      const r = resizeAnnRef.current;
                      const dx = e.clientX - r.startX;
                      const dy = e.clientY - r.startY;
                      let newW = r.startW, newH = r.startH;
                      let newX = r.startAnnX, newY = r.startAnnY;
                      const h = r.handle;
                      if (h === 'br') { newW = r.startW + dx; newH = r.startH + dy; }
                      else if (h === 'bl') { newW = r.startW - dx; newH = r.startH + dy; newX = r.startAnnX + dx; }
                      else if (h === 'tr') { newW = r.startW + dx; newH = r.startH - dy; newY = r.startAnnY + dy; }
                      else if (h === 'tl') { newW = r.startW - dx; newH = r.startH - dy; newX = r.startAnnX + dx; newY = r.startAnnY + dy; }
                      else if (h === 'r') { newW = r.startW + dx; }
                      else if (h === 'l') { newW = r.startW - dx; newX = r.startAnnX + dx; }
                      else if (h === 'b') { newH = r.startH + dy; }
                      else if (h === 't') { newH = r.startH - dy; newY = r.startAnnY + dy; }
                      newW = Math.max(20, newW);
                      newH = Math.max(20, newH);
                      updateAnnotation(r.id, { width: newW, height: newH, x: newX, y: newY });
                    }
                  }}
                  onMouseUp={() => {
                    handleOverlayMouseUp();
                    setFreehandPoints([]);
                    if (resizeAnnRef.current) resizeAnnRef.current = null;
                  }}
                  onMouseLeave={() => {
                    handleOverlayMouseUp();
                    setFreehandPoints([]);
                    if (resizeAnnRef.current) resizeAnnRef.current = null;
                  }}
                >
                  {/* Render Annotations for current page */}
                  {annotations.filter(a => a.pageIndex === currentPage - 1).map(ann => (
                    <div 
                      key={ann.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedId(ann.id); }}
                      className={`absolute group ${selectedId === ann.id ? 'ring-2 ring-indigo-500' : ''} ${!activeTool && ann.type !== 'freehand' ? 'cursor-move' : 'cursor-pointer'}`}
                      style={{ 
                        left: ann.x, 
                        top: ann.y, 
                        width: ann.width || (ann.type === 'text' ? Math.max(200, (ann.text?.length || 10) * (ann.fontSize || 14) * 0.6) : undefined), 
                        height: Math.max(ann.height || 24, ann.type === 'text' ? (ann.fontSize || 14) * 1.5 : 0),
                        backgroundColor: ann.type === 'whiteout' ? (ann.color || '#ffffff') : ann.type === 'highlight' ? 'rgba(255, 255, 0, 0.4)' : ann.type === 'link' ? 'rgba(0, 0, 255, 0.2)' : 'transparent',
                        border: ann.type === 'link' ? '1px dashed blue' : ann.type === 'table' ? '1px solid #ccc' : 'none'
                      }}
                    >
                      {ann.type === 'text' && (
                        <input 
                          type="text" 
                          value={ann.text}
                          onChange={(e) => updateAnnotationText(ann.id, e.target.value)}
                          className="bg-transparent border border-transparent outline-none text-black px-1 w-full h-full"
                          style={{
                            fontSize: `${ann.fontSize || 14}px`,
                            color: ann.color || '#000000',
                            fontWeight: ann.bold ? 700 : 400,
                            fontStyle: ann.italic ? 'italic' : 'normal',
                          }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      {ann.type === 'table' && ann.tableData && (
                        <div 
                          className="w-full h-full grid bg-white" 
                          style={{ 
                            gridTemplateRows: `repeat(${ann.rows}, 1fr)`,
                            gridTemplateColumns: `repeat(${ann.cols}, 1fr)`
                          }}
                        >
                          {ann.tableData.map((row, ri) => (
                            row.map((cell, ci) => (
                              <input
                                key={`${ri}-${ci}`}
                                value={cell}
                                onChange={(e) => updateTableData(ann.id, ri, ci, e.target.value)}
                                className="border border-gray-300 text-[10px] p-0.5 outline-none focus:bg-indigo-50"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ))
                          ))}
                        </div>
                      )}
                      {ann.type === 'signature' && ann.signatureDataUrl && (
                        <img src={ann.signatureDataUrl} alt="Signature" className="w-full h-full object-contain pointer-events-none" />
                      )}
                      {ann.type === 'image' && ann.imageDataUrl && (
                        <img src={ann.imageDataUrl} alt="Inserted" className="w-full h-full object-fill pointer-events-none" />
                      )}
                      {/* 8-handle resize for image & signature */}
                      {(ann.type === 'image' || ann.type === 'signature' || ann.type === 'text') && selectedId === ann.id && (
                        <>
                          {/* Corner handles */}
                          <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-indigo-500 border border-white rounded-sm cursor-nwse-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'tl', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-indigo-500 border border-white rounded-sm cursor-nesw-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'tr', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-indigo-500 border border-white rounded-sm cursor-nesw-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'bl', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-indigo-500 border border-white rounded-sm cursor-nwse-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'br', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          {/* Edge handles */}
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-indigo-400 border border-white rounded-sm cursor-ns-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 't', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-indigo-400 border border-white rounded-sm cursor-ns-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'b', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-6 bg-indigo-400 border border-white rounded-sm cursor-ew-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'l', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-6 bg-indigo-400 border border-white rounded-sm cursor-ew-resize z-20"
                            onMouseDown={e => { e.stopPropagation(); resizeAnnRef.current = { id: ann.id, handle: 'r', startX: e.clientX, startY: e.clientY, startAnnX: ann.x, startAnnY: ann.y, startW: ann.width || 150, startH: ann.height || 50 }; }} />
                          {/* Size label */}
                          <div className="absolute -top-5 left-0 text-[9px] font-bold text-indigo-600 bg-white/90 px-1 rounded whitespace-nowrap z-20">
                            {Math.round(ann.width || 0)}×{Math.round(ann.height || 0)}
                          </div>
                        </>
                      )}
                      {ann.type === 'freehand' && ann.pathData && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style={{ left: -ann.x, top: -ann.y, width: pageViewport?.width, height: pageViewport?.height }}>
                          <path d={ann.pathData} fill="none" stroke={ann.color || '#000'} strokeWidth={ann.strokeWidth || 2} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {ann.type === 'link' && (
                        <div className="w-full h-full flex items-center justify-center text-blue-800 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                          LINK
                        </div>
                      )}
                      
                      {/* Delete & Move indicators */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); pushUndo(); deleteAnnotation(ann.id); }}
                        className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-sm"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      {!activeTool && ann.type !== 'freehand' && (
                        <div className="absolute -top-3 -left-3 bg-indigo-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-sm">
                          <Move className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Live freehand path */}
                  {isDrawing && activeTool === 'freehand' && freehandPoints.length > 1 && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ width: pageViewport?.width, height: pageViewport?.height }}>
                      <path 
                        d={freehandPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} 
                        fill="none" 
                        stroke={freehandColor} 
                        strokeWidth={freehandWidth} 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                      />
                    </svg>
                  )}

                  {/* Current Drawing Rect */}
                  {isDrawing && currentRect && (
                    <div 
                      className="absolute border border-indigo-500 bg-indigo-500/20"
                      style={{
                        left: currentRect.x,
                        top: currentRect.y,
                        width: currentRect.w,
                        height: currentRect.h
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Properties Sidebar */}
            <div className="w-80 bg-white border-l border-gray-200 p-6 overflow-y-auto">
              {selectedId ? (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900">Properties</h3>
                    <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {annotations.find(a => a.id === selectedId)?.type === 'text' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Text Content</label>
                        <textarea
                          value={annotations.find(a => a.id === selectedId)?.text || ''}
                          onChange={(e) => updateAnnotationText(selectedId, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          rows={3}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Font Size</label>
                          <input
                            type="number"
                            value={annotations.find(a => a.id === selectedId)?.fontSize || 14}
                            onChange={(e) => updateAnnotation(selectedId, { fontSize: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Text Color</label>
                          <input
                            type="color"
                            value={annotations.find(a => a.id === selectedId)?.color || '#000000'}
                            onChange={(e) => updateAnnotation(selectedId, { color: e.target.value })}
                            className="w-full h-10 p-1 border border-gray-300 rounded-lg cursor-pointer"
                          />
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!annotations.find(a => a.id === selectedId)?.bold}
                            onChange={(e) => updateAnnotation(selectedId, { bold: e.target.checked })}
                            className="rounded border-gray-300"
                          />
                          Bold
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!annotations.find(a => a.id === selectedId)?.italic}
                            onChange={(e) => updateAnnotation(selectedId, { italic: e.target.checked })}
                            className="rounded border-gray-300"
                          />
                          Italic
                        </label>
                      </div>
                      <p className="text-xs text-gray-500">
                        Exported PDF uses Helvetica / Helvetica-Bold / Oblique variants (standard embedded fonts).
                      </p>
                    </div>
                  )}

                  {annotations.find(a => a.id === selectedId)?.type === 'table' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Rows</label>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={annotations.find(a => a.id === selectedId)?.rows || 3}
                            onChange={(e) => {
                              const newRows = parseInt(e.target.value);
                              const currentCols = annotations.find(a => a.id === selectedId)?.cols || 3;
                              const currentData = annotations.find(a => a.id === selectedId)?.tableData || [];
                              const newData = Array.from({ length: newRows }, (_, r) => 
                                Array.from({ length: currentCols }, (_, c) => 
                                  currentData[r]?.[c] || ''
                                )
                              );
                              updateAnnotation(selectedId, { rows: newRows, tableData: newData });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Cols</label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={annotations.find(a => a.id === selectedId)?.cols || 3}
                            onChange={(e) => {
                              const newCols = parseInt(e.target.value);
                              const currentRows = annotations.find(a => a.id === selectedId)?.rows || 3;
                              const currentData = annotations.find(a => a.id === selectedId)?.tableData || [];
                              const newData = Array.from({ length: currentRows }, (_, r) => 
                                Array.from({ length: newCols }, (_, c) => 
                                  currentData[r]?.[c] || ''
                                )
                              );
                              updateAnnotation(selectedId, { cols: newCols, tableData: newData });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 italic">Editing table content directly in the grid.</p>
                    </div>
                  )}

                  {annotations.find(a => a.id === selectedId)?.type === 'freehand' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Stroke Color</label>
                        <input
                          type="color"
                          value={annotations.find(a => a.id === selectedId)?.color || '#000000'}
                          onChange={(e) => updateAnnotation(selectedId, { color: e.target.value })}
                          className="w-full h-10 p-1 border border-gray-300 rounded-lg cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Stroke Width: {annotations.find(a => a.id === selectedId)?.strokeWidth || 2}px</label>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={annotations.find(a => a.id === selectedId)?.strokeWidth || 2}
                          onChange={(e) => updateAnnotation(selectedId, { strokeWidth: parseInt(e.target.value) })}
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <button
                      onClick={() => { pushUndo(); deleteAnnotation(selectedId); }}
                      className="w-full py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 text-sm font-medium transition-colors"
                    >
                      Delete Element
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400">
                    <MousePointer2 className="w-8 h-8 mb-4 opacity-20" />
                    <p className="text-sm">Select an element to edit its properties</p>
                    <p className="text-xs mt-2 text-gray-300">Drag elements to reposition them</p>
                  </div>
                  {/* Freehand settings when freehand tool active */}
                  {activeTool === 'freehand' && (
                    <div className="space-y-4 border-t border-gray-200 pt-4">
                      <h3 className="text-sm font-bold text-gray-800">Draw Settings</h3>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                        <input type="color" value={freehandColor} onChange={e => setFreehandColor(e.target.value)} className="w-full h-10 p-1 border border-gray-300 rounded-lg cursor-pointer" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Width: {freehandWidth}px</label>
                        <input type="range" min={1} max={10} value={freehandWidth} onChange={e => setFreehandWidth(Number(e.target.value))} className="w-full" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="p-8 bg-green-50 rounded-xl border border-green-200 mb-6">
              <h3 className="text-2xl font-bold text-green-800 mb-4">PDF edited successfully!</h3>
              <a
                href={editedUrl}
                download={`edited_${file.name}`}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
              >
                <Download className="w-6 h-6" />
                Download Edited PDF
              </a>
            </div>
            <button
              onClick={() => { setFile(null); setEditedUrl(null); setAnnotations([]); setUndoStack([]); setRedoStack([]); }}
              className="text-gray-600 hover:text-gray-900 font-medium"
            >
              Edit another PDF
            </button>
          </div>
        </div>
      )}

      {/* Signature Modal */}
      {showSignatureModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Draw your signature</h3>
            <div className="border-2 border-dashed border-gray-300 rounded-lg mb-4 bg-gray-50">
              <SignatureCanvas 
                ref={sigCanvasRef}
                canvasProps={{ className: 'w-full h-48 rounded-lg' }}
                penColor="black"
              />
            </div>
            <div className="flex justify-between gap-4">
              <button 
                onClick={() => sigCanvasRef.current?.clear()}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
              >
                Clear
              </button>
              <div className="flex gap-2">
                <button 
                  onClick={() => { setShowSignatureModal(false); setActiveTool(null); }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={saveSignature}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Add Link URL</h3>
            <input 
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none mb-6"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => { setShowLinkModal(false); setPendingLinkRect(null); setActiveTool(null); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={saveLink}
                disabled={!linkUrl}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                Add Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
