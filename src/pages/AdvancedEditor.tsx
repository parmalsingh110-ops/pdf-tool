import { useState, useRef, useEffect } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
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
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import FileDropzone from '../components/FileDropzone';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Tool = 'select' | 'text' | 'whiteout' | 'highlight' | 'signature' | 'link' | 'table' | null;

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

  useEffect(() => {
    if (pdfDoc) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage]);

  const renderPage = async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return;
    
    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
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

      // Detection logic for 'True' editing
      const textContent = await page.getTextContent();
      const items = textContent.items.map((item: any) => {
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        return {
          text: item.str,
          x: tx[4],
          y: tx[5] - item.height * viewport.scale, // pdfjs returns baseline
          w: item.width * viewport.scale,
          h: item.height * viewport.scale
        };
      });
      setDetectedText(items);
    } catch (error) {
      console.error("Error rendering page:", error);
    }
  };

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    if (!activeTool || !overlayRef.current) return;
    
    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'select') {
      // Check if we clicked on a detected text block
      const clickedText = detectedText.find(t => 
        x >= t.x && x <= t.x + t.w && 
        y >= t.y && y <= t.y + t.h
      );

      if (clickedText) {
        // AUTOMATIC REPLACE: Create whiteout AND text annotation
        const id = Date.now().toString();
        const whiteout: Annotation = {
          id: id + '_w',
          type: 'whiteout',
          pageIndex: currentPage - 1,
          x: clickedText.x,
          y: clickedText.y,
          width: clickedText.w,
          height: clickedText.h
        };
        const text: Annotation = {
          id: id + '_t',
          type: 'text',
          pageIndex: currentPage - 1,
          x: clickedText.x,
          y: clickedText.y,
          text: clickedText.text, // Pre-fill with original text
          fontSize: 14,
          color: '#000000',
          bold: defaultBold,
          italic: defaultItalic,
        };
        setAnnotations([...annotations, whiteout, text]);
        setSelectedId(text.id);
        setActiveTool(null);
      }
    } else if (activeTool === 'text') {
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: 'text',
        pageIndex: currentPage - 1,
        x,
        y,
        text: 'New Text',
        fontSize,
        color: textColor,
        bold: defaultBold,
        italic: defaultItalic,
      };
      setAnnotations([...annotations, newAnnotation]);
      setSelectedId(newAnnotation.id);
      setActiveTool(null);
    } else if (['whiteout', 'highlight', 'link', 'table'].includes(activeTool)) {
      setIsDrawing(true);
      setStartPos({ x, y });
      setCurrentRect({ x, y, w: 0, h: 0 });
    } else if (activeTool === 'signature') {
      setShowSignatureModal(true);
      setStartPos({ x, y });
    }
  };

  const handleOverlayMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !overlayRef.current || !currentRect) return;
    
    const rect = overlayRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    setCurrentRect({
      x: Math.min(startPos.x, currentX),
      y: Math.min(startPos.y, currentY),
      w: Math.abs(currentX - startPos.x),
      h: Math.abs(currentY - startPos.y)
    });
  };

  const handleOverlayMouseUp = () => {
    if (!isDrawing || !currentRect) return;
    
    setIsDrawing(false);
    
    if (currentRect.w > 5 && currentRect.h > 5) {
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
        setAnnotations([...annotations, newAnnotation]);
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
        setAnnotations([...annotations, newAnnotation]);
        setSelectedId(newAnnotation.id);
      }
    }
    setCurrentRect(null);
    setActiveTool(null);
  };

  const saveSignature = () => {
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      const dataUrl = sigCanvasRef.current.getTrimmedCanvas().toDataURL('image/png');
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: 'signature',
        pageIndex: currentPage - 1,
        x: startPos.x,
        y: startPos.y,
        width: 150, // default width
        height: 50, // default height
        signatureDataUrl: dataUrl
      };
      setAnnotations([...annotations, newAnnotation]);
      setShowSignatureModal(false);
      setActiveTool(null);
    }
  };

  const saveLink = () => {
    if (pendingLinkRect && linkUrl) {
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
      setAnnotations([...annotations, newAnnotation]);
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

          ann.tableData.forEach((row, r) => {
            row.forEach((cell, c) => {
              const cx = pdfX + (c * cellW);
              const cy = pdfY - ((r + 1) * cellH);
              
              // Draw cell border
              page.drawRectangle({
                x: cx,
                y: cy,
                width: cellW,
                height: cellH,
                borderWidth: 1 / scale,
                borderColor: rgb(0.8, 0.8, 0.8),
                color: rgb(1, 1, 1),
              });

              // Draw cell text
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
          page.drawRectangle({
            x: pdfX,
            y: pdfY - pdfH,
            width: pdfW,
            height: pdfH,
            color: rgb(1, 1, 1),
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

  return (
    <div className="flex-1 flex flex-col bg-gray-100">
      {!file ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-3xl">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">Advanced PDF Editor</h1>
              <p className="text-xl text-gray-600">Add text, whiteout, highlights, signatures, and links.</p>
            </div>
            <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
          </div>
        </div>
      ) : !editedUrl ? (
        <div className="flex-1 flex flex-col h-full">
          {/* Toolbar */}
          <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm z-10">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTool(activeTool === 'select' ? null : 'select')}
                className={`p-2 rounded-lg flex items-center gap-2 transition-colors ${activeTool === 'select' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                title="Select & Edit Existing Text"
              >
                <MousePointer2 className="w-5 h-5" />
                <span className="hidden sm:inline text-sm font-medium">Select</span>
              </button>
              <div className="w-px h-6 bg-gray-200 mx-1"></div>
              <button
                onClick={() => setActiveTool(activeTool === 'text' ? null : 'text')}
                className={`p-2 rounded-lg flex items-center gap-2 transition-colors ${activeTool === 'text' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                title="Add New Text"
              >
                <Type className="w-5 h-5" />
                <span className="hidden sm:inline text-sm font-medium">Text</span>
              </button>
              <button
                type="button"
                onClick={toggleBoldForText}
                className={`p-2 rounded-lg flex items-center gap-1 transition-colors ${
                  (selectedTextAnn ? !!selectedTextAnn.bold : defaultBold)
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title="Bold (selected text or default for new text)"
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
                title="Italic (selected text or default for new text)"
              >
                <Italic className="w-5 h-5" />
              </button>
              <button
                onClick={() => setActiveTool(activeTool === 'table' ? null : 'table')}
                className={`p-2 rounded-lg flex items-center gap-2 transition-colors ${activeTool === 'table' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                title="Add Table"
              >
                <Table className="w-5 h-5" />
                <span className="hidden sm:inline text-sm font-medium">Table</span>
              </button>
              <button
                onClick={() => setActiveTool(activeTool === 'whiteout' ? null : 'whiteout')}
                className={`p-2 rounded-lg flex items-center gap-2 transition-colors ${activeTool === 'whiteout' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                title="Whiteout"
              >
                <Square className="w-5 h-5" />
                <span className="hidden sm:inline text-sm font-medium">Whiteout</span>
              </button>
              <button
                onClick={() => setActiveTool(activeTool === 'highlight' ? null : 'highlight')}
                className={`p-2 rounded-lg flex items-center gap-2 transition-colors ${activeTool === 'highlight' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                title="Highlight"
              >
                <Highlighter className="w-5 h-5" />
                <span className="hidden sm:inline text-sm font-medium">Highlight</span>
              </button>
              <button
                onClick={() => setActiveTool(activeTool === 'signature' ? null : 'signature')}
                className={`p-2 rounded-lg flex items-center gap-2 transition-colors ${activeTool === 'signature' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                title="Sign"
              >
                <PenTool className="w-5 h-5" />
                <span className="hidden sm:inline text-sm font-medium">Sign</span>
              </button>
              <button
                onClick={() => setActiveTool(activeTool === 'link' ? null : 'link')}
                className={`p-2 rounded-lg flex items-center gap-2 transition-colors ${activeTool === 'link' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                title="Add Link"
              >
                <LinkIcon className="w-5 h-5" />
                <span className="hidden sm:inline text-sm font-medium">Link</span>
              </button>
            </div>
            
            <div className="flex items-center gap-4">
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
              <button
                onClick={applyChangesAndSave}
                disabled={isProcessing}
                className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {isProcessing ? 'Saving...' : 'Apply Changes'}
              </button>
            </div>
          </div>

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
                  className={`absolute top-0 left-0 w-full h-full z-10 ${activeTool ? 'cursor-crosshair' : ''}`}
                  onMouseDown={handleOverlayMouseDown}
                  onMouseMove={handleOverlayMouseMove}
                  onMouseUp={handleOverlayMouseUp}
                  onMouseLeave={handleOverlayMouseUp}
                >
                  {/* Render Annotations for current page */}
                  {annotations.filter(a => a.pageIndex === currentPage - 1).map(ann => (
                    <div 
                      key={ann.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedId(ann.id); }}
                      className={`absolute group cursor-pointer ${selectedId === ann.id ? 'ring-2 ring-indigo-500' : ''}`}
                      style={{ 
                        left: ann.x, 
                        top: ann.y, 
                        width: ann.width, 
                        height: ann.height,
                        backgroundColor: ann.type === 'whiteout' ? 'white' : ann.type === 'highlight' ? 'rgba(255, 255, 0, 0.4)' : ann.type === 'link' ? 'rgba(0, 0, 255, 0.2)' : 'transparent',
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
                          {ann.tableData.map((row, r) => (
                            row.map((cell, c) => (
                              <input
                                key={`${r}-${c}`}
                                value={cell}
                                onChange={(e) => updateTableData(ann.id, r, c, e.target.value)}
                                className="border border-gray-300 text-[10px] p-0.5 outline-none focus:bg-indigo-50"
                              />
                            ))
                          ))}
                        </div>
                      )}
                      {ann.type === 'signature' && ann.signatureDataUrl && (
                        <img src={ann.signatureDataUrl} alt="Signature" className="w-full h-full object-contain pointer-events-none" />
                      )}
                      {ann.type === 'link' && (
                        <div className="w-full h-full flex items-center justify-center text-blue-800 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                          LINK
                        </div>
                      )}
                      
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteAnnotation(ann.id); }}
                        className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-sm"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

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

                  <div>
                    <button
                      onClick={() => deleteAnnotation(selectedId)}
                      className="w-full py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 text-sm font-medium transition-colors"
                    >
                      Delete Element
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-400">
                  <MousePointer2 className="w-8 h-8 mb-4 opacity-20" />
                  <p className="text-sm">Select an element to edit its properties</p>
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
              onClick={() => { setFile(null); setEditedUrl(null); setAnnotations([]); }}
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
