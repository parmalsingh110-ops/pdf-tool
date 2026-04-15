import { useState, useEffect } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import { Download, FileText, RotateCw, Trash2, GripVertical } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { usePageSEO } from '../lib/usePageSEO';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PageData {
  id: string;
  originalIndex: number;
  rotation: number;
  thumbnailUrl: string;
}

export default function OrganizePDF() {
  usePageSEO('Organize PDF Pages', 'Reorder, delete, and rearrange PDF pages with drag & drop. Free online PDF organizer.');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [organizedUrl, setOrganizedUrl] = useState<string | null>(null);
  const [isLoadingPages, setIsLoadingPages] = useState(false);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setOrganizedUrl(null);
      await loadPdfPages(selectedFile);
    }
  };

  const loadPdfPages = async (pdfFile: File) => {
    setIsLoadingPages(true);
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const newPages: PageData[] = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          await page.render({
            canvasContext: context,
            viewport: viewport,
            canvas: canvas
          }).promise;
          
          newPages.push({
            id: `page-${i}-${Date.now()}`,
            originalIndex: i - 1,
            rotation: 0,
            thumbnailUrl: canvas.toDataURL('image/jpeg', 0.8)
          });
        }
      }
      setPages(newPages);
    } catch (error) {
      console.error("Error loading PDF pages:", error);
    } finally {
      setIsLoadingPages(false);
    }
  };

  const rotatePage = (index: number) => {
    const newPages = [...pages];
    newPages[index].rotation = (newPages[index].rotation + 90) % 360;
    setPages(newPages);
  };

  const deletePage = (index: number) => {
    setPages(pages.filter((_, i) => i !== index));
  };

  const movePage = (index: number, direction: 'left' | 'right') => {
    if (
      (direction === 'left' && index === 0) || 
      (direction === 'right' && index === pages.length - 1)
    ) return;

    const newPages = [...pages];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    [newPages[index], newPages[targetIndex]] = [newPages[targetIndex], newPages[index]];
    setPages(newPages);
  };

  const saveOrganizedPdf = async () => {
    if (!file || pages.length === 0) return;
    
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(arrayBuffer);
      const newPdf = await PDFDocument.create();

      for (const pageData of pages) {
        const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageData.originalIndex]);
        
        if (pageData.rotation !== 0) {
          const currentRotation = copiedPage.getRotation().angle;
          copiedPage.setRotation(degrees(currentRotation + pageData.rotation));
        }
        
        newPdf.addPage(copiedPage);
      }

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setOrganizedUrl(url);
    } catch (error) {
      console.error("Error organizing PDF:", error);
      alert("An error occurred while organizing the PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Organize PDF</h1>
        <p className="text-xl text-gray-600">Sort, delete, or rotate pages of your PDF file.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : isLoadingPages ? (
        <div className="flex flex-col items-center justify-center p-12">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-lg text-gray-600">Loading pages...</p>
        </div>
      ) : !organizedUrl ? (
        <div className="w-full max-w-6xl">
          <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">{pages.length} pages remaining</p>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => { setFile(null); setPages([]); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={saveOrganizedPdf}
                disabled={isProcessing || pages.length === 0}
                className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isProcessing ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {pages.map((page, index) => (
              <div key={page.id} className="relative group bg-white p-2 rounded-xl border-2 border-transparent hover:border-blue-400 shadow-sm transition-all">
                <div className="absolute top-2 left-2 bg-black/50 text-white text-xs font-bold px-2 py-1 rounded z-10">
                  {index + 1}
                </div>
                
                <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button onClick={() => deletePage(index)} className="p-1.5 bg-red-500 text-white rounded hover:bg-red-600" title="Delete page">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => rotatePage(index)} className="p-1.5 bg-blue-500 text-white rounded hover:bg-blue-600" title="Rotate page">
                    <RotateCw className="w-4 h-4" />
                  </button>
                </div>

                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button onClick={() => movePage(index, 'left')} disabled={index === 0} className="p-1 bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50">
                    &larr;
                  </button>
                  <button onClick={() => movePage(index, 'right')} disabled={index === pages.length - 1} className="p-1 bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50">
                    &rarr;
                  </button>
                </div>

                <div className="aspect-[1/1.4] overflow-hidden rounded bg-gray-100 flex items-center justify-center">
                  <img 
                    src={page.thumbnailUrl} 
                    alt={`Page ${index + 1}`}
                    className="max-w-full max-h-full object-contain transition-transform duration-300"
                    style={{ transform: `rotate(${page.rotation}deg)` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="p-8 bg-green-50 rounded-xl border border-green-200 mb-6">
            <h3 className="text-2xl font-bold text-green-800 mb-4">PDF organized successfully!</h3>
            <a
              href={organizedUrl}
              download={`organized_${file.name}`}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
            >
              <Download className="w-6 h-6" />
              Download PDF
            </a>
          </div>
          <button
            onClick={() => { setFile(null); setOrganizedUrl(null); setPages([]); }}
            className="text-gray-600 hover:text-gray-900 font-medium"
          >
            Organize another PDF
          </button>
        </div>
      )}
    </div>
  );
}
