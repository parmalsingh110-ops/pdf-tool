import React, { useState } from 'react';
import { FileCode, Download, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';

export default function ExtractTables() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [csvData, setCsvData] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);

  const handleDrop = (files: File[]) => {
    if (files[0]) { setFile(files[0]); setCsvData(null); setPreviewRows([]); }
  };

  const process = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const allRows: string[][] = [];
      const Y_TOLERANCE = 5;

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        const items = (textContent.items as any[])
          .filter(i => i.str.trim())
          .map(i => ({ text: i.str, x: i.transform[4], y: i.transform[5] }));

        items.sort((a, b) => b.y - a.y);

        const rows: { y: number; items: any[] }[] = [];
        for (const item of items) {
          const found = rows.find(r => Math.abs(r.y - item.y) < Y_TOLERANCE);
          if (found) found.items.push(item);
          else rows.push({ y: item.y, items: [item] });
        }

        for (const row of rows) {
          row.items.sort((a: any, b: any) => a.x - b.x);
          allRows.push(row.items.map((i: any) => i.text));
        }

        if (p < pdf.numPages) allRows.push([]);
      }

      // Generate CSV
      const csv = allRows.map(row => row.map(cell => {
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')).join('\n');

      setCsvData(csv);
      setPreviewRows(allRows.slice(0, 20));
    } catch (e: any) {
      alert(e?.message || 'Extraction failed.');
    } finally {
      setBusy(false);
    }
  };

  const downloadCsv = () => {
    if (!csvData) return;
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tables_${file?.name || 'data'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Extract Tables to CSV</h1>
        <p className="text-xl text-gray-600">Extract tabular data from your PDF into downloadable CSV files.</p>
      </div>
      {!file ? (
        <FileDropzone onDrop={handleDrop} multiple={false} title="Select PDF file" />
      ) : (
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex gap-3 mb-6">
            <button onClick={process} disabled={busy} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileCode className="w-5 h-5" />}
              {busy ? 'Extracting…' : 'Extract Tables'}
            </button>
            {csvData && (
              <button onClick={downloadCsv} className="px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 flex items-center gap-2">
                <Download className="w-5 h-5" /> Download CSV
              </button>
            )}
            <button onClick={() => { setFile(null); setCsvData(null); }} className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">Cancel</button>
          </div>
          {previewRows.length > 0 && (
            <div className="overflow-auto max-h-[400px] border border-gray-200 rounded-xl">
              <table className="min-w-full text-sm">
                <tbody>
                  {previewRows.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      {row.length === 0 ? <td className="px-3 py-1 text-gray-300 italic">— page break —</td> :
                        row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-1 border-r border-gray-200 text-gray-800 whitespace-nowrap">{cell}</td>
                        ))
                      }
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewRows.length >= 20 && <p className="text-xs text-gray-500 p-2">Showing first 20 rows. Download CSV for full data.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
