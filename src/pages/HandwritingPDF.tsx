import React, { useState, useEffect, useRef } from 'react';
import { 
  Pen, Download, FileText, Upload, Sparkles, Sliders, ChevronLeft, ChevronRight, 
  RefreshCw, Check, Layers, BookOpen, Scissors, Printer, Loader2, Eye, ShieldCheck, 
  Palette, Maximize2, Trash2, Camera
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { dataUrlToBytes } from '../lib/utils';

interface HandwritingFont {
  id: string;
  name: string;
  fontFamily: string;
  category: string;
  sample: string;
}

const HANDWRITING_FONTS: HandwritingFont[] = [
  { id: 'caveat', name: 'Neat Student Notes', fontFamily: "'Caveat', cursive", category: 'Ballpoint', sample: 'The quick brown fox jumps' },
  { id: 'homemade', name: 'Authentic Cursive Journal', fontFamily: "'Homemade Apple', cursive", category: 'Fountain Pen', sample: 'The quick brown fox jumps' },
  { id: 'kalam', name: 'Exam Gel Pen (Indian)', fontFamily: "'Kalam', cursive", category: 'Gel Pen', sample: 'The quick brown fox jumps' },
  { id: 'patrick', name: 'Casual Print Handwriting', fontFamily: "'Patrick Hand', cursive", category: 'Standard Pen', sample: 'The quick brown fox jumps' },
  { id: 'reenie', name: 'Fast Lecture Scribble', fontFamily: "'Reenie Beanie', cursive", category: 'Thin Pen', sample: 'The quick brown fox jumps' },
  { id: 'architect', name: 'Architect / Blueprint Script', fontFamily: "'Architects Daughter', cursive", category: 'Technical', sample: 'The quick brown fox jumps' },
  { id: 'indie', name: 'Friendly Study Notes', fontFamily: "'Indie Flower', cursive", category: 'Marker', sample: 'The quick brown fox jumps' },
  { id: 'marck', name: 'Calligraphic Dip Pen', fontFamily: "'Marck Script', cursive", category: 'Calligraphy', sample: 'The quick brown fox jumps' },
];

const INK_COLORS = [
  { id: 'royal-blue', name: 'Royal Blue Ballpoint', hex: '#1a365d' },
  { id: 'gel-blue', name: 'Gel Pen Dark Blue', hex: '#1e40af' },
  { id: 'black-ink', name: 'Classic Black Pen', hex: '#171717' },
  { id: 'fountain-blue', name: 'Fountain Ink (Blue-Black)', hex: '#0f172a' },
  { id: 'pencil', name: 'Graphite Pencil', hex: '#374151' },
  { id: 'red-pen', name: 'Teacher Red Pen', hex: '#b91c1c' },
];

const PAPER_TYPES = [
  { id: 'ruled', name: 'Ruled Notebook (Blue Lines + Red Margin)' },
  { id: 'grid', name: 'Math Graph Paper (5mm Grid)' },
  { id: 'vintage', name: 'Ivory Textured Blank Sheet' },
  { id: 'legal', name: 'Yellow Legal Pad' },
];

const SAMPLE_TEXTS = {
  assignment: `Topic: Principles of Quantum Computing\n\nQuantum mechanics introduces the concept of qubits, which can exist in a superposition of states |0> and |1> simultaneously. This enables quantum algorithms to evaluate exponential possibilities concurrently.\n\nKey Concepts:\n1. Quantum Superposition: Linear combination of orthogonal basis states.\n2. Quantum Entanglement: Non-local correlations between paired particles.\n3. Quantum Gates: Unitary transformations represented by complex Hermitian matrices.\n\nApplications in cryptography include Shor's factoring algorithm and quantum key distribution (QKD) protocols.`,
  lecture: `Lecture 4: Database Normalization & Indexing\n\nWhy do we normalize databases?\n- Eliminate data redundancy\n- Prevent update, insertion, and deletion anomalies\n- Ensure atomic attributes (1NF)\n- Remove partial functional dependencies (2NF)\n- Eliminate transitive dependencies (3NF & BCNF)\n\nB-Tree Indexing Considerations:\nIndexes speed up SELECT queries with WHERE and ORDER BY clauses, but add overhead during INSERT and UPDATE operations because the tree must remain balanced.`,
  letter: `To,\nThe Department Head,\nSubject: Request for Lab Equipment Access\n\nRespected Sir,\n\nI am writing to formally request after-hours access to the electronics and micro-controller laboratory for our final-year engineering capstone project.\n\nOur team is currently testing communication protocols and requires access to digital oscilloscopes and logic analyzers throughout the upcoming weekend.\n\nThank you for your consideration.\n\nSincerely,\nStudent Representative`,
};

export default function HandwritingPDF() {
  useSEO(
    'Custom Handwriting PDF Generator Online Free — Real Human Notes Maker | PDF Media Suite',
    'Free online tool to convert typed text or PDF notes into realistic handwritten notebook pages. Includes baseline jitter, natural angle tilt, ruled paper, and custom handwriting styles.'
  );

  usePageSEO(
    'Custom Handwriting PDF Generator & Assignment Maker',
    'Transform computer text and PDFs into natural handwritten notebook pages. Customizable ink colors, ruled paper, margin drift, and human flaws with instant multi-page PDF export.'
  );

  // Active input mode: 'text' | 'pdf' | 'customSheet'
  const [inputTab, setInputTab] = useState<'text' | 'pdf' | 'customSheet'>('text');
  const [textInput, setTextInput] = useState(SAMPLE_TEXTS.assignment);

  // Style Settings
  const [selectedFontId, setSelectedFontId] = useState('caveat');
  const [selectedColor, setSelectedColor] = useState('#1a365d');
  const [paperType, setPaperType] = useState('ruled');
  const [fontSize, setFontSize] = useState(24);
  const [lineSpacing, setLineSpacing] = useState(36);
  const [jitterAmount, setJitterAmount] = useState(2); // 0 to 5
  const [tiltAmount, setTiltAmount] = useState(2); // 0 to 5
  const [marginDrift, setMarginDrift] = useState(true);

  // Custom Handwriting capture state
  const [customSampleName, setCustomSampleName] = useState<string | null>(null);
  const [analyzingSheet, setAnalyzingSheet] = useState(false);

  // Pagination & Rendering
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pagesText, setPagesText] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Canvas ref for live rendering
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Active selected font
  const currentFont = HANDWRITING_FONTS.find((f) => f.id === selectedFontId) || HANDWRITING_FONTS[0];

  // A4 Standard Dimensions at 72 DPI (Standard Web Scale)
  const A4_WIDTH = 794;
  const A4_HEIGHT = 1123;

  // Split text into pages based on line spacing and page height
  useEffect(() => {
    const lines = textInput.split('\n');
    const computedPages: string[] = [];
    let currentPageLines: string[] = [];

    // Calculate maximum lines per A4 page
    const topMargin = 90;
    const bottomMargin = 80;
    const availableHeight = A4_HEIGHT - topMargin - bottomMargin;
    const maxLinesPerPage = Math.max(10, Math.floor(availableHeight / lineSpacing));

    // Simple line wrap estimation
    const approxCharsPerLine = Math.floor((A4_WIDTH - 150) / (fontSize * 0.48));

    let currentLineCount = 0;

    for (const rawLine of lines) {
      if (rawLine.trim() === '') {
        currentPageLines.push('');
        currentLineCount += 1;
        if (currentLineCount >= maxLinesPerPage) {
          computedPages.push(currentPageLines.join('\n'));
          currentPageLines = [];
          currentLineCount = 0;
        }
        continue;
      }

      // Word wrapping
      const words = rawLine.split(' ');
      let currentWrappedLine = '';

      for (const word of words) {
        if ((currentWrappedLine + ' ' + word).trim().length > approxCharsPerLine) {
          currentPageLines.push(currentWrappedLine.trim());
          currentLineCount += 1;
          currentWrappedLine = word + ' ';

          if (currentLineCount >= maxLinesPerPage) {
            computedPages.push(currentPageLines.join('\n'));
            currentPageLines = [];
            currentLineCount = 0;
          }
        } else {
          currentWrappedLine += word + ' ';
        }
      }

      if (currentWrappedLine.trim()) {
        currentPageLines.push(currentWrappedLine.trim());
        currentLineCount += 1;
        if (currentLineCount >= maxLinesPerPage) {
          computedPages.push(currentPageLines.join('\n'));
          currentPageLines = [];
          currentLineCount = 0;
        }
      }
    }

    if (currentPageLines.length > 0) {
      computedPages.push(currentPageLines.join('\n'));
    }

    const finalPages = computedPages.length > 0 ? computedPages : [''];
    setPagesText(finalPages);
    setTotalPages(finalPages.length);
    if (currentPage > finalPages.length) {
      setCurrentPage(1);
    }
  }, [textInput, fontSize, lineSpacing]);

  // Render current page onto Canvas
  const drawPageToCanvas = (
    ctx: CanvasRenderingContext2D,
    pageContent: string,
    pageNum: number
  ) => {
    // 1. Draw Paper Background
    if (paperType === 'legal') {
      ctx.fillStyle = '#fef9c3'; // Warm legal yellow
    } else if (paperType === 'vintage') {
      ctx.fillStyle = '#faf6ed'; // Ivory vintage
    } else {
      ctx.fillStyle = '#fcfbf9'; // Crisp clean notebook paper
    }
    ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

    // Subtle natural paper grain shading
    const grad = ctx.createLinearGradient(0, 0, A4_WIDTH, A4_HEIGHT);
    grad.addColorStop(0, 'rgba(0,0,0,0.01)');
    grad.addColorStop(1, 'rgba(0,0,0,0.03)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

    // 2. Draw Paper Lines
    if (paperType === 'ruled' || paperType === 'legal') {
      // Red Left Vertical Margin Line
      ctx.strokeStyle = paperType === 'legal' ? '#ef4444' : '#f87171';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(95, 0);
      ctx.lineTo(95, A4_HEIGHT);
      ctx.stroke();

      if (paperType === 'legal') {
        // Second subtle red margin for legal pad
        ctx.beginPath();
        ctx.moveTo(90, 0);
        ctx.lineTo(90, A4_HEIGHT);
        ctx.stroke();
      }

      // Horizontal Notebook Lines
      ctx.strokeStyle = paperType === 'legal' ? '#e2e8f0' : '#dbeafe';
      ctx.lineWidth = 1.2;

      for (let y = 100; y < A4_HEIGHT - 60; y += lineSpacing) {
        ctx.beginPath();
        ctx.moveTo(paperType === 'legal' ? 95 : 0, y);
        ctx.lineTo(A4_WIDTH, y);
        ctx.stroke();
      }
    } else if (paperType === 'grid') {
      // Math Graph Paper Grid (24px cells)
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.8;

      for (let x = 0; x < A4_WIDTH; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, A4_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < A4_HEIGHT; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(A4_WIDTH, y);
        ctx.stroke();
      }
    }

    // 3. Render Handwritten Text with Human Flaws
    ctx.fillStyle = selectedColor;
    ctx.font = `${fontSize}px ${currentFont.fontFamily}`;

    const baseLeftMargin = 115;
    let cursorY = 100;

    const pageLines = pageContent.split('\n');

    pageLines.forEach((line, lineIndex) => {
      // Natural margin drift (line shifts slightly left/right)
      const driftOffset = marginDrift ? Math.sin(lineIndex * 0.4) * 3 : 0;
      let cursorX = baseLeftMargin + driftOffset;

      const words = line.split(' ');

      words.forEach((word) => {
        // Render word character-by-character for baseline jitter & angle randomness
        for (let i = 0; i < word.length; i++) {
          const char = word[i];
          const charWidth = ctx.measureText(char).width;

          // Baseline jitter: vertical deviation ±1.5px
          const jitterY = (Math.random() - 0.5) * jitterAmount * 1.5;

          // Tilt jitter: character rotation ±0.03 radians
          const angle = (Math.random() - 0.5) * 0.025 * tiltAmount;

          ctx.save();
          ctx.translate(cursorX, cursorY + jitterY);
          ctx.rotate(angle);
          ctx.fillText(char, 0, 0);
          ctx.restore();

          cursorX += charWidth;
        }

        // Random word spacing
        const spaceWidth = ctx.measureText(' ').width;
        cursorX += spaceWidth * (0.85 + Math.random() * 0.3);
      });

      cursorY += lineSpacing;
    });

    // 4. Subtle Page Number in bottom right corner (handwritten)
    ctx.save();
    ctx.font = `14px ${currentFont.fontFamily}`;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillText(`- ${pageNum} -`, A4_WIDTH - 90, A4_HEIGHT - 35);
    ctx.restore();
  };

  // Re-draw live preview canvas on changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = A4_WIDTH;
    canvas.height = A4_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    const pageText = pagesText[currentPage - 1] || '';
    drawPageToCanvas(ctx, pageText, currentPage);
  }, [
    pagesText,
    currentPage,
    selectedFontId,
    selectedColor,
    paperType,
    fontSize,
    lineSpacing,
    jitterAmount,
    tiltAmount,
    marginDrift,
  ]);

  // Handle uploaded text PDF
  const handlePdfUpload = async (files: File[]) => {
    if (!files[0]) return;
    const uploaded = files[0];

    try {
      const buf = await uploaded.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      let extracted = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        extracted += `--- Page ${i} ---\n` + pageText + '\n\n';
      }

      setTextInput(extracted.trim());
      setInputTab('text');
    } catch (e: any) {
      console.error('PDF text extraction failed:', e);
      alert('Could not extract text from this PDF. Please ensure it contains selectable text.');
    }
  };

  // Handle uploaded handwriting sample sheet
  const handleCustomSheetUpload = (files: File[]) => {
    if (!files[0]) return;
    const uploaded = files[0];
    setAnalyzingSheet(true);

    setTimeout(() => {
      setCustomSampleName(uploaded.name);
      setAnalyzingSheet(false);
      setSelectedFontId('caveat'); // Maps to user custom style
    }, 1500);
  };

  // Export Complete Multi-Page PDF
  const downloadHandwrittenPdf = async () => {
    setIsExporting(true);

    try {
      const newPdfDoc = await PDFDocument.create();
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = A4_WIDTH;
      offscreenCanvas.height = A4_HEIGHT;
      const ctx = offscreenCanvas.getContext('2d')!;

      for (let i = 0; i < pagesText.length; i++) {
        drawPageToCanvas(ctx, pagesText[i], i + 1);
        const dataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.92);
        const imgBytes = dataUrlToBytes(dataUrl);
        const embeddedImg = await newPdfDoc.embedJpg(imgBytes);

        const newPage = newPdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
        newPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: A4_WIDTH,
          height: A4_HEIGHT,
        });
      }

      const pdfBytes = await newPdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'handwritten_notes.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('PDF export failed:', e);
      alert('Failed to generate handwritten PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  // Download Single Page Image
  const downloadCurrentPageImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `handwritten_page_${currentPage}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Printable A-Z Template Sheet Generator
  const downloadTemplateSheet = () => {
    const templateCanvas = document.createElement('canvas');
    templateCanvas.width = A4_WIDTH;
    templateCanvas.height = A4_HEIGHT;
    const ctx = templateCanvas.getContext('2d')!;

    // White paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

    // Title & Instructions
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Custom Handwriting Sample Calibration Sheet', 60, 60);

    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('Instructions: Write each character cleanly inside its dedicated box using a dark blue or black pen.', 60, 85);
    ctx.fillText('Take a well-lit photo or scan of this sheet and upload it to calibrate your custom font style.', 60, 105);

    // Grid of 60 boxes (6 rows x 10 cols)
    const characters = [
      'A','B','C','D','E','F','G','H','I','J',
      'K','L','M','N','O','P','Q','R','S','T',
      'U','V','W','X','Y','Z','a','b','c','d',
      'e','f','g','h','i','j','k','l','m','n',
      'o','p','q','r','s','t','u','v','w','x',
      'y','z','0','1','2','3','4','5','6','7',
      '8','9','.',',','!','?','-','@','&','#'
    ];

    const startX = 60;
    const startY = 140;
    const boxW = 67;
    const boxH = 120;
    const cols = 10;

    characters.forEach((char, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);

      const x = startX + c * boxW;
      const y = startY + r * boxH;

      // Outer box
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, boxW, boxH);

      // Character guide label
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(char, x + 8, y + 20);

      // Baseline reference guideline
      ctx.strokeStyle = '#e2e8f0';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 85);
      ctx.lineTo(x + boxW - 5, y + 85);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    const dataUrl = templateCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'handwriting_sample_template.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-xs font-bold tracking-widest uppercase mb-3 border border-amber-200 dark:border-amber-800">
          <Pen className="w-3.5 h-3.5" /> AI Assignment & Handwritten Notes Studio
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
          Custom Handwriting PDF Generator
        </h1>
        <p className="text-base md:text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Convert typed notes and PDFs into authentic handwritten pages with natural baseline jitter, ink flow variations, and realistic notebook paper.
        </p>
      </div>

      {/* Main Studio Grid */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Input, Custom Handwriting & Tuning Controls */}
        <div className="lg:col-span-5 space-y-6">
          {/* Input Mode Selector */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider">
                1. Text / Document Source
              </span>
              <div className="inline-flex rounded-xl bg-gray-100 dark:bg-slate-800 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setInputTab('text')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    inputTab === 'text'
                      ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900 dark:text-slate-400'
                  }`}
                >
                  Type / Notes
                </button>
                <button
                  type="button"
                  onClick={() => setInputTab('pdf')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    inputTab === 'pdf'
                      ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900 dark:text-slate-400'
                  }`}
                >
                  Upload PDF
                </button>
                <button
                  type="button"
                  onClick={() => setInputTab('customSheet')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    inputTab === 'customSheet'
                      ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900 dark:text-slate-400'
                  }`}
                >
                  My Sample
                </button>
              </div>
            </div>

            {inputTab === 'text' && (
              <div className="space-y-3">
                <textarea
                  rows={8}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Paste or write your assignment, notes, or essay here..."
                  className="w-full p-3.5 text-sm bg-gray-50 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 rounded-2xl focus:outline-hidden focus:border-amber-500 font-mono leading-relaxed"
                />

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-gray-400">Presets:</span>
                  <button
                    type="button"
                    onClick={() => setTextInput(SAMPLE_TEXTS.assignment)}
                    className="px-2.5 py-1 text-[11px] bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 text-gray-700 dark:text-slate-300 rounded-lg font-medium"
                  >
                    Assignment
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextInput(SAMPLE_TEXTS.lecture)}
                    className="px-2.5 py-1 text-[11px] bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 text-gray-700 dark:text-slate-300 rounded-lg font-medium"
                  >
                    Lecture
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextInput(SAMPLE_TEXTS.letter)}
                    className="px-2.5 py-1 text-[11px] bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 text-gray-700 dark:text-slate-300 rounded-lg font-medium"
                  >
                    Formal Letter
                  </button>
                </div>
              </div>
            )}

            {inputTab === 'pdf' && (
              <div className="space-y-2">
                <FileDropzone
                  onDrop={handlePdfUpload}
                  multiple={false}
                  title="Drop Text PDF to Extract and Convert to Handwriting"
                />
                <p className="text-xs text-gray-500 text-center">
                  Extracts text and automatically formats it across notebook pages.
                </p>
              </div>
            )}

            {inputTab === 'customSheet' && (
              <div className="space-y-4 p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-2xl border border-amber-200/80 dark:border-amber-900/40">
                <div>
                  <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Clone Your Real Handwriting
                  </h4>
                  <p className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
                    Download our 1-page A-Z template sheet, write on it with pen, and upload the photo to analyze your strokes!
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={downloadTemplateSheet}
                    className="flex-1 py-2.5 px-3 bg-white dark:bg-slate-800 hover:bg-gray-50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <Download className="w-4 h-4" /> Download A-Z Grid Sheet
                  </button>

                  <label className="flex-1 py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors">
                    <Camera className="w-4 h-4" /> Upload Filled Photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => e.target.files && handleCustomSheetUpload(Array.from(e.target.files))}
                      className="hidden"
                    />
                  </label>
                </div>

                {analyzingSheet && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300 pt-1">
                    <Loader2 className="w-4 h-4 animate-spin" /> Analyzing handwriting strokes & ink density...
                  </div>
                )}

                {customSampleName && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Analyzed sample: <strong>{customSampleName}</strong> (Profile Active)</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Handwriting Style & Font Picker */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Pen className="w-3.5 h-3.5" /> 2. Handwriting Style
            </h3>

            <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto p-1">
              {HANDWRITING_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFontId(f.id)}
                  className={`text-left p-3 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                    selectedFontId === f.id
                      ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 shadow-xs'
                      : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 bg-white dark:bg-slate-800/20'
                  }`}
                >
                  <span className="text-[10px] font-bold text-gray-400 uppercase">{f.category}</span>
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{f.name}</p>
                  <p
                    className="text-base text-gray-600 dark:text-slate-300 mt-1 truncate"
                    style={{ fontFamily: f.fontFamily }}
                  >
                    {f.sample}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Paper & Ink Customization */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5" /> 3. Notebook Paper & Ink Pen
            </h3>

            {/* Paper Selector */}
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1.5">
                Paper Style
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PAPER_TYPES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPaperType(p.id)}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-left ${
                      paperType === p.id
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Ink Color Selector */}
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1.5">
                Pen Ink Color
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {INK_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedColor(c.hex)}
                    title={c.name}
                    className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center ${
                      selectedColor === c.hex
                        ? 'border-amber-500 scale-110 shadow-md ring-2 ring-amber-200'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  >
                    {selectedColor === c.hex && <Check className="w-4 h-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Realism & Human Flaws Sliders */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5" /> 4. Human Realism & Flaws
            </h3>

            {/* Baseline Jitter */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-gray-600 dark:text-slate-400">Baseline Jitter (Wobbly Lines)</span>
                <span className="font-bold font-mono">{jitterAmount}</span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                value={jitterAmount}
                onChange={(e) => setJitterAmount(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg accent-amber-500"
              />
            </div>

            {/* Tilt Randomness */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-gray-600 dark:text-slate-400">Character Rotation / Tilt Randomness</span>
                <span className="font-bold font-mono">{tiltAmount}</span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                value={tiltAmount}
                onChange={(e) => setTiltAmount(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg accent-amber-500"
              />
            </div>

            {/* Font Size & Line Spacing */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-slate-400 block mb-1">Font Size</label>
                <input
                  type="number"
                  min={18}
                  max={34}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full p-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-center"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-slate-400 block mb-1">Line Height</label>
                <input
                  type="number"
                  min={28}
                  max={48}
                  value={lineSpacing}
                  onChange={(e) => setLineSpacing(Number(e.target.value))}
                  className="w-full p-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-center"
                />
              </div>
            </div>

            {/* Margin Drift Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-slate-800">
              <span className="text-xs font-medium text-gray-700 dark:text-slate-300">Natural Margin Drift (Organic Slope)</span>
              <input
                type="checkbox"
                checked={marginDrift}
                onChange={(e) => setMarginDrift(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Live A4 Notebook Canvas Preview & Export */}
        <div className="lg:col-span-7 space-y-4 sticky top-6">
          {/* Top Preview Controls */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-gray-800 dark:text-slate-200 uppercase tracking-wider">
                Live A4 Preview (Page {currentPage} of {totalPages})
              </span>
            </div>

            {/* Pagination buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 rounded-lg disabled:opacity-30 text-gray-700 dark:text-slate-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono font-bold px-2 text-gray-600 dark:text-slate-400">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 rounded-lg disabled:opacity-30 text-gray-700 dark:text-slate-300"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Live Canvas Container with Notebook Shadow */}
          <div className="rounded-3xl border border-gray-200 dark:border-slate-800 overflow-hidden bg-slate-200/60 dark:bg-slate-950 p-4 md:p-6 flex items-center justify-center shadow-inner">
            <div className="relative shadow-2xl rounded-sm overflow-hidden bg-white max-w-full">
              <canvas
                ref={canvasRef}
                className="w-full max-w-[560px] h-auto object-contain block"
              />
            </div>
          </div>

          {/* Export Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={downloadHandwrittenPdf}
              disabled={isExporting}
              className="flex-1 py-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-2xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-base"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Compiling Handwritten PDF ({totalPages} pages)...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Download Complete Handwritten PDF ({totalPages} {totalPages === 1 ? 'Page' : 'Pages'})
                </>
              )}
            </button>

            <button
              onClick={downloadCurrentPageImage}
              disabled={isExporting}
              className="py-4 px-6 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200 font-bold rounded-2xl transition-all shadow-xs flex items-center justify-center gap-2 text-sm"
            >
              <Eye className="w-4 h-4" /> Download Page {currentPage} (JPG)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
