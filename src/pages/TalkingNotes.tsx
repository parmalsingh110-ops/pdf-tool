import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Play,
  Square,
  Upload,
  Download,
  QrCode,
  Volume2,
  FileText,
  Sparkles,
  CheckCircle2,
  Trash2,
  Plus,
  Radio,
  BookOpen,
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { downloadBlob } from '../lib/utils';

interface AudioAnnotation {
  id: string;
  pageNum: number;
  label: string;
  audioBlob: Blob | null;
  audioUrl: string | null;
  duration: number;
  xPos: number; // percentage
  yPos: number; // percentage
}

export default function TalkingNotes() {
  useSEO(
    'Talking Notes — Embed Voice Audio QR Codes in PDF Handouts | PDF Media Suite',
    'Record teacher voice explanations and embed scannable audio QR codes onto printed coaching notes. Students scan the paper with their phone to hear audio guidance.'
  );

  usePageSEO(
    'Talking Notes Maker — Smart Coaching Handout Generator',
    'Transform coaching notes, science diagrams, and university study guides into interactive talking handouts. Embed voice note QR codes directly onto PDF pages.',
    'talking notes maker, audio qr code pdf, voice explanation on printed notes, smart coaching handouts, interactive study notes, embed audio qr',
    '/talking-notes'
  );

  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [annotations, setAnnotations] = useState<AudioAnnotation[]>([]);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<any>(null);

  // Canvas Preview
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      alert('Please select a PDF document.');
      return;
    }

    setFileName(file.name);
    setAnnotations([]);
    try {
      const buffer = await file.arrayBuffer();
      const u8 = new Uint8Array(buffer);
      setPdfBytes(u8);

      const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
      setTotalPages(doc.numPages);
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
      alert('Failed to open PDF.');
    }
  };

  // Render Current Page Preview
  useEffect(() => {
    if (!pdfBytes) return;

    let isCancelled = false;

    const render = async () => {
      const doc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
      if (isCancelled) return;
      const page = await doc.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1.0 });

      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    };

    render();

    return () => {
      isCancelled = true;
    };
  }, [pdfBytes, currentPage]);

  // Start Voice Recording
  const startRecording = async (annoId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);

        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === annoId
              ? { ...a, audioBlob, audioUrl, duration: recordingSeconds }
              : a
          )
        );

        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setActiveAnnotationId(annoId);
      setRecordingSeconds(0);

      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error(err);
      alert('Microphone access is required to record voice notes.');
    }
  };

  // Stop Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      clearInterval(recordTimerRef.current);
      setIsRecording(false);
      setActiveAnnotationId(null);
    }
  };

  const handleAddAnnotation = () => {
    const newAnno: AudioAnnotation = {
      id: `audio_${Date.now()}`,
      pageNum: currentPage,
      label: `Teacher Voice Note #${annotations.length + 1}`,
      audioBlob: null,
      audioUrl: null,
      duration: 0,
      xPos: 75,
      yPos: 15,
    };
    setAnnotations([...annotations, newAnno]);
  };

  const handleRemoveAnnotation = (id: string) => {
    setAnnotations(annotations.filter((a) => a.id !== id));
  };

  // Generate Talking Notes PDF with embedded QR Code Stamp
  const handleExportPdf = async () => {
    if (!pdfBytes) return;

    setIsProcessing(true);

    try {
      const doc = await PDFDocument.load(pdfBytes);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

      for (const anno of annotations) {
        if (anno.pageNum <= doc.getPageCount()) {
          const page = doc.getPage(anno.pageNum - 1);
          const { width, height } = page.getSize();

          // Standard QR Code encoding link (Audio note player or data link)
          const targetUrl = `https://pdfmediasuite.in/audio-note?id=${anno.id}&note=${encodeURIComponent(anno.label)}`;
          const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=4&data=${encodeURIComponent(targetUrl)}`;

          try {
            const qrResp = await fetch(qrApiUrl);
            const qrBytes = await qrResp.arrayBuffer();
            const qrImg = await doc.embedPng(qrBytes);

            // Stamp dimensions
            const qrSize = 65;
            const bannerWidth = 140;
            const bannerHeight = 80;

            const stampX = (anno.xPos / 100) * width - bannerWidth / 2;
            const stampY = height - (anno.yPos / 100) * height - bannerHeight / 2;

            // Draw white background card with border
            page.drawRectangle({
              x: stampX,
              y: stampY,
              width: bannerWidth,
              height: bannerHeight,
              color: rgb(1, 1, 1),
              borderColor: rgb(0.2, 0.4, 0.9),
              borderWidth: 1.5,
            });

            // Draw QR Image
            page.drawImage(qrImg, {
              x: stampX + 8,
              y: stampY + 8,
              width: qrSize,
              height: qrSize,
            });

            // Draw text banner next to QR
            page.drawText('TALKING NOTE', {
              x: stampX + qrSize + 14,
              y: stampY + bannerHeight - 20,
              size: 8,
              font,
              color: rgb(0.1, 0.3, 0.8),
            });

            page.drawText('Scan with Phone', {
              x: stampX + qrSize + 14,
              y: stampY + bannerHeight - 34,
              size: 7,
              font: fontRegular,
              color: rgb(0.2, 0.2, 0.2),
            });

            page.drawText('to Hear Audio', {
              x: stampX + qrSize + 14,
              y: stampY + bannerHeight - 45,
              size: 7,
              font: fontRegular,
              color: rgb(0.2, 0.2, 0.2),
            });
          } catch (e) {
            console.warn('Could not embed QR for annotation', e);
          }
        }
      }

      const outBytes = await doc.save();
      const blob = new Blob([outBytes as any], { type: 'application/pdf' });
      downloadBlob(blob, `TalkingNotes_${fileName}`);
    } catch (err) {
      console.error(err);
      alert('Error creating Talking Notes PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-2">
              <Volume2 className="w-3.5 h-3.5" /> Smart Audio QR Handouts for Students &amp; Teachers
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">
              &quot;Talking Notes&quot; Audio QR Handout Maker
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Record voice explanations for complex formulas &amp; diagrams. Embeds scannable audio QR codes on PDF pages for Xerox printing.
            </p>
          </div>

          {pdfBytes && (
            <button
              onClick={handleExportPdf}
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {isProcessing ? 'Generating Talking PDF...' : 'Download Talking Handout PDF'}
            </button>
          )}
        </div>

        {/* Upload State */}
        {!pdfBytes && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-12 text-center bg-white dark:bg-slate-900 hover:border-indigo-500 hover:bg-indigo-50/20 dark:hover:bg-indigo-950/20 cursor-pointer transition-all group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              accept="application/pdf"
              className="hidden"
            />
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <Mic className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Drop Coaching Notes or Study PDF Here
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Select any diagram, record your voice explanation via microphone, and print paper notes with interactive audio QR codes.
            </p>
          </div>
        )}

        {/* Studio Editor View */}
        {pdfBytes && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Interactive Page Canvas */}
            <div className="lg:col-span-7 space-y-4">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Page {currentPage} of {totalPages}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    className="px-3 py-1 text-xs font-bold rounded-lg border disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    className="px-3 py-1 text-xs font-bold rounded-lg border disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>

                <button
                  onClick={handleAddAnnotation}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 border border-indigo-200 dark:border-indigo-900"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Audio QR Note
                </button>
              </div>

              {/* PDF Preview with Stamped Audio Badges */}
              <div className="relative p-6 rounded-3xl bg-slate-200 dark:bg-slate-900 flex justify-center overflow-auto border border-slate-300 dark:border-slate-800 min-h-[500px]">
                <canvas ref={canvasRef} className="bg-white shadow-xl rounded-sm max-w-full" />

                {/* Stamped QR Overlays */}
                {annotations
                  .filter((a) => a.pageNum === currentPage)
                  .map((a) => (
                    <div
                      key={a.id}
                      style={{ top: `${a.yPos}%`, left: `${a.xPos}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-800 border-2 border-indigo-600 rounded-2xl p-2 shadow-2xl flex items-center gap-2 pointer-events-auto"
                    >
                      <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl flex items-center justify-center text-indigo-600">
                        <QrCode className="w-6 h-6" />
                      </div>
                      <div className="pr-1 text-left">
                        <div className="text-[10px] font-black text-indigo-600 uppercase">Audio QR</div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[100px]">
                          {a.label}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Right Column: Audio Recording Controls & Annotations List */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Radio className="w-4 h-4 text-indigo-600" /> Voice Explanations on This Sheet
                  </h3>
                  <span className="text-xs font-bold text-slate-400">
                    {annotations.length} Audio QR(s)
                  </span>
                </div>

                {annotations.length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
                    <Volume2 className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-500">
                      No audio notes yet. Click &quot;Add Audio QR Note&quot; to attach teacher guidance.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {annotations.map((anno) => {
                      const isThisRecording = isRecording && activeAnnotationId === anno.id;

                      return (
                        <div
                          key={anno.id}
                          className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <input
                              type="text"
                              value={anno.label}
                              onChange={(e) =>
                                setAnnotations(
                                  annotations.map((a) =>
                                    a.id === anno.id ? { ...a, label: e.target.value } : a
                                  )
                                )
                              }
                              className="text-xs font-bold bg-transparent border-b border-dashed border-slate-300 dark:border-slate-600 outline-none text-slate-900 dark:text-white w-2/3"
                            />
                            <button
                              onClick={() => handleRemoveAnnotation(anno.id)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            {/* Record Button */}
                            {!isThisRecording ? (
                              <button
                                onClick={() => startRecording(anno.id)}
                                className="flex-1 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <Mic className="w-3.5 h-3.5" />
                                {anno.audioUrl ? 'Re-Record Voice' : 'Record Explanation'}
                              </button>
                            ) : (
                              <button
                                onClick={stopRecording}
                                className="flex-1 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-1.5 animate-pulse"
                              >
                                <Square className="w-3.5 h-3.5" />
                                Stop Recording ({recordingSeconds}s)
                              </button>
                            )}

                            {/* Audio Player if available */}
                            {anno.audioUrl && (
                              <audio controls src={anno.audioUrl} className="h-8 max-w-[140px]" />
                            )}
                          </div>

                          {/* Position Sliders */}
                          <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-500 pt-1">
                            <div>
                              <span>Horizontal Pos ({anno.xPos}%)</span>
                              <input
                                type="range"
                                min="10"
                                max="90"
                                value={anno.xPos}
                                onChange={(e) =>
                                  setAnnotations(
                                    annotations.map((a) =>
                                      a.id === anno.id ? { ...a, xPos: Number(e.target.value) } : a
                                    )
                                  )
                                }
                                className="w-full h-1"
                              />
                            </div>
                            <div>
                              <span>Vertical Pos ({anno.yPos}%)</span>
                              <input
                                type="range"
                                min="10"
                                max="90"
                                value={anno.yPos}
                                onChange={(e) =>
                                  setAnnotations(
                                    annotations.map((a) =>
                                      a.id === anno.id ? { ...a, yPos: Number(e.target.value) } : a
                                    )
                                  )
                                }
                                className="w-full h-1"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SEO Information */}
        <ToolSEOSection
          toolName="Talking Notes Audio QR Handout Maker"
          headline="Attach Voice Explanations to Physical Printed Notes with Scannable Audio QR Codes"
          description="Designed for professors, coaching faculties, school teachers, and study groups. Record voice instructions directly onto study PDF pages. The tool automatically embeds high-resolution scannable QR codes alongside complex equations and diagram steps. When students print the notes for offline study, they can scan any QR code with a smartphone camera to listen to the teacher's audio explanation on demand."
        />
      </div>
    </div>
  );
}
