import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import GenericToolUI from '../components/GenericToolUI';

export default function PdfToExcel() {
  const [processingState, setProcessingState] = useState('');

  const handleProcess = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      
      let allData: any[][] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        setProcessingState(`Analyzing structural data on page ${i} of ${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        
        // Extract items with coordinates
        // transform[4] is X, transform[5] is Y
        const items = content.items.map((item: any) => ({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5]
        }));

        // Group by Y to form rows (with a tolerance of ~5 units)
        // Note: PDF y-coordinates usually start from bottom to top, so higher Y is higher on page.
        // Let's sort by Y descending so top rows come first.
        items.sort((a, b) => b.y - a.y);

        const rows: { y: number, items: any[] }[] = [];
        const Y_TOLERANCE = 5;

        items.forEach(item => {
          // Ignore empty strings to keep layout clean
          if (!item.text.trim()) return;

          let foundRow = rows.find(r => Math.abs(r.y - item.y) < Y_TOLERANCE);
          if (foundRow) {
            foundRow.items.push(item);
          } else {
            rows.push({ y: item.y, items: [item] });
          }
        });

        // Now sort each row by X to establish columns
        const pageRowsAscending = rows.map(r => {
          r.items.sort((a, b) => a.x - b.x);
          return r.items.map(item => item.text);
        });

        allData = allData.concat(pageRowsAscending);
        
        // Add a blank row between pages for clarity
        if (i < pdf.numPages) {
          allData.push([]); 
        }
      }

      setProcessingState('Compiling Excel spreadsheet...');
      
      const worksheet = XLSX.utils.aoa_to_sheet(allData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      
      const outBytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([outBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error("PDF to Excel Error:", error);
      throw error;
    }
  };

  return (
    <GenericToolUI 
      title="PDF to Excel"
      description="Convert PDF tables and grid layouts directly into real Excel spreadsheets using client-side algorithms."
      icon={FileText}
      colorClass="text-emerald-700"
      bgClass="bg-emerald-50"
      actionText={processingState || "Convert to Excel"}
      onProcess={handleProcess}
      requiresBackendAlert={false} // Now fully functional!
      outputExtension=".xlsx"
    />
  );
}
