import { useState, useEffect } from 'react';
import { Download, FileText, Tag } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { PDFDocument } from 'pdf-lib';

export default function EditMetadata() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editedUrl, setEditedUrl] = useState<string | null>(null);
  
  const [metadata, setMetadata] = useState({
    title: '',
    author: '',
    subject: '',
    creator: '',
    producer: '',
    keywords: ''
  });

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setEditedUrl(null);
      
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        
        setMetadata({
          title: pdfDoc.getTitle() || '',
          author: pdfDoc.getAuthor() || '',
          subject: pdfDoc.getSubject() || '',
          creator: pdfDoc.getCreator() || '',
          producer: pdfDoc.getProducer() || '',
          keywords: pdfDoc.getKeywords() || ''
        });
      } catch (error) {
        console.error("Error reading metadata:", error);
      }
    }
  };

  const saveMetadata = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      pdfDoc.setTitle(metadata.title);
      pdfDoc.setAuthor(metadata.author);
      pdfDoc.setSubject(metadata.subject);
      pdfDoc.setCreator(metadata.creator);
      pdfDoc.setProducer(metadata.producer);
      
      if (metadata.keywords) {
        pdfDoc.setKeywords(metadata.keywords.split(',').map(k => k.trim()));
      } else {
        pdfDoc.setKeywords([]);
      }
      
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setEditedUrl(url);
    } catch (error) {
      console.error("Error saving metadata:", error);
      alert("An error occurred while saving the PDF metadata.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Edit PDF Metadata</h1>
        <p className="text-xl text-gray-600">Change the author, title, keywords, and subject of your PDF.</p>
      </div>

      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200 mb-8">
            <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
              <Tag className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-gray-900 truncate">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          {!editedUrl ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={metadata.title}
                    onChange={(e) => setMetadata({...metadata, title: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
                  <input
                    type="text"
                    value={metadata.author}
                    onChange={(e) => setMetadata({...metadata, author: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={metadata.subject}
                    onChange={(e) => setMetadata({...metadata, subject: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Keywords (comma separated)</label>
                  <input
                    type="text"
                    value={metadata.keywords}
                    onChange={(e) => setMetadata({...metadata, keywords: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Creator</label>
                  <input
                    type="text"
                    value={metadata.creator}
                    onChange={(e) => setMetadata({...metadata, creator: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Producer</label>
                  <input
                    type="text"
                    value={metadata.producer}
                    onChange={(e) => setMetadata({...metadata, producer: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={saveMetadata}
                  disabled={isProcessing}
                  className="flex-1 py-4 bg-purple-600 text-white text-lg font-bold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 shadow-md"
                >
                  {isProcessing ? 'Saving...' : 'Save Metadata'}
                </button>
                <button
                  onClick={() => { setFile(null); }}
                  className="px-6 py-4 bg-gray-100 text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-center">
              <div className="p-8 bg-green-50 rounded-xl border border-green-200">
                <h3 className="text-2xl font-bold text-green-800 mb-4">Metadata updated!</h3>
                <a
                  href={editedUrl}
                  download={`metadata_${file.name}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 transition-colors shadow-md"
                >
                  <Download className="w-6 h-6" />
                  Download PDF
                </a>
              </div>
              <button
                onClick={() => { setFile(null); setEditedUrl(null); }}
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Edit another PDF
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
