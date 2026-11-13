import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  FileSpreadsheet,
  Download,
  Loader2,
  Table,
  Copy,
  Check,
  FileCode,
  Plus,
  Trash2,
  Cpu,
  Server,
  FileDown,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import '../lib/pdfWorker';
import FileDropzone from '../components/FileDropzone';
import { usePageSEO } from '../lib/usePageSEO';
import { useSEO } from '../hooks/useSEO';
import { apiFetch } from '../lib/api';
import { triggerBlobDownload } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay, PearlStageSwitch } from '../components/pearl/PearlMotion';

interface ExtractedTable {
  id: string;
  pageIndex: number;
  name: string;
  rows: string[][];
}

export default function ExtractTables() {
  useSEO(
    'Extract Tables from PDF to Excel Online Free — Interactive Spreadsheet Editor',
    'Extract tables from PDF into structured spreadsheets online. Interactive editable grid, export to Excel (XLSX), CSV, JSON, Markdown Table, or HTML.'
  );

  usePageSEO(
    'PDF Table Extractor & Spreadsheet Editor Studio',
    'Extract tabular data from any PDF. Live spreadsheet grid preview, cell editing, and 1-click export to Excel (.xlsx), CSV, JSON, and Markdown.'
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [engineMode, setEngineMode] = useState<'camelot' | 'spatial'>('camelot');
  const [tables, setTables] = useState<ExtractedTable[]>([]);
  const [activeTableIdx, setActiveTableIdx] = useState(0);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  const prefersReduced = useReducedMotion();

  // Fallback spatial extractor running 100% in browser
  const extractClientSpatial = async (f: File): Promise<ExtractedTable[]> => {
    const buf = await f.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const extracted: ExtractedTable[] = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const textContent = await page.getTextContent();

      const rowMap = new Map<number, { x: number; text: string }[]>();

      for (const item of textContent.items as any[]) {
        const str = (item.str || '').trim();
        if (!str) continue;
        const y = Math.round(item.transform[5]);
        const x = Math.round(item.transform[4]);

        let matchedY = Array.from(rowMap.keys()).find(k => Math.abs(k - y) <= 4);
        if (matchedY === undefined) {
          matchedY = y;
          rowMap.set(matchedY, []);
        }
        rowMap.get(matchedY)!.push({ x, text: str });
      }

      const sortedYs = Array.from(rowMap.keys()).sort((a, b) => b - a);
      const candidateRows: string[][] = [];

      for (const y of sortedYs) {
        const cells = rowMap.get(y)!;
        cells.sort((a, b) => a.x - b.x);
        if (cells.length >= 2) {
          candidateRows.push(cells.map(c => c.text));
        }
      }

      if (candidateRows.length >= 2) {
        const maxCols = Math.max(...candidateRows.map(r => r.length));
        const normalizedRows = candidateRows.map(r => {
          const rowCopy = [...r];
          while (rowCopy.length < maxCols) rowCopy.push('');
          return rowCopy;
        });

        extracted.push({
          id: `tbl_p${p}`,
          pageIndex: p,
          name: `Table on Page ${p}`,
          rows: normalizedRows,
        });
      }
    }

    return extracted;
  };

  const handleDrop = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setFile(f);
    setTables([]);
    setActiveTableIdx(0);
    setBusy(true);

    try {
      let extracted: ExtractedTable[] = [];
      if (engineMode === 'camelot') {
        setStatusMsg('Analyzing document with Camelot-py ML table parser...');
        try {
          const fd = new FormData();
          fd.append('file', f);

          const res = await apiFetch('/extract-tables', {
            method: 'POST',
            body: fd,
            timeoutMs: 60000,
          });

          if (res.ok) {
            const arrayBuf = await res.arrayBuffer();
            const wb = XLSX.read(arrayBuf, { type: 'array' });

            wb.SheetNames.forEach((sheetName, sIdx) => {
              const ws = wb.Sheets[sheetName];
              const rawData = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
              if (rawData && rawData.length > 0) {
                const stringRows = rawData.map(r => (Array.isArray(r) ? r.map(c => String(c ?? '')) : []));
                const maxC = Math.max(...stringRows.map(r => r.length));
                const normalized = stringRows.map(r => {
                  while (r.length < maxC) r.push('');
                  return r;
                });

                extracted.push({
                  id: `camelot_${sIdx}`,
                  pageIndex: sIdx + 1,
                  name: sheetName.replace(/_/g, ' '),
                  rows: normalized,
                });
              }
            });
          }
        } catch (camelotErr) {
          console.warn('Backend Camelot extraction failed or offline, falling back to spatial:', camelotErr);
        }
      }

      if (extracted.length === 0) {
        setStatusMsg('Running client spatial table extraction...');
        extracted = await extractClientSpatial(f);
      }

      setTables(extracted);
      setActiveTableIdx(0);
    } catch (err: any) {
      console.error('Table extraction error:', err);
      alert(`Extraction failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
      setStatusMsg('');
    }
  };

  const updateCell = (rowIdx: number, colIdx: number, val: string) => {
    setTables(prev => prev.map((t, tIdx) => {
      if (tIdx !== activeTableIdx) return t;
      const newRows = t.rows.map((r, rIdx) => {
        if (rIdx !== rowIdx) return r;
        const newR = [...r];
        newR[colIdx] = val;
        return newR;
      });
      return { ...t, rows: newRows };
    }));
  };

  const addRow = () => {
    const cur = tables[activeTableIdx];
    if (!cur) return;
    const colCount = cur.rows[0]?.length || 4;
    const newEmptyRow = new Array(colCount).fill('');
    setTables(prev => prev.map((t, idx) => idx === activeTableIdx ? { ...t, rows: [...t.rows, newEmptyRow] } : t));
  };

  const deleteRow = (rIdx: number) => {
    setTables(prev => prev.map((t, idx) => {
      if (idx !== activeTableIdx) return t;
      if (t.rows.length <= 1) return t;
      return { ...t, rows: t.rows.filter((_, i) => i !== rIdx) };
    }));
  };

  const addColumn = () => {
    setTables(prev => prev.map((t, idx) => {
      if (idx !== activeTableIdx) return t;
      return {
        ...t,
        rows: t.rows.map((r, rIdx) => [...r, rIdx === 0 ? `Column ${r.length + 1}` : '']),
      };
    }));
  };

  // Export Formats
  const downloadExcel = () => {
    if (!tables.length) return;
    const wb = XLSX.utils.book_new();

    tables.forEach((t, i) => {
      const ws = XLSX.utils.aoa_to_sheet(t.rows);
      const sheetName = (t.name || `Table_${i + 1}`).substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    const outName = `${file?.name.replace(/\.pdf$/i, '') || 'extracted'}_tables.xlsx`;
    XLSX.writeFile(wb, outName);
  };

  const downloadCsv = () => {
    const currentTable = tables[activeTableIdx];
    if (!currentTable) return;

    const csvContent = currentTable.rows
      .map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, `${file?.name.replace(/\.pdf$/i, '')}_Table_${activeTableIdx + 1}.csv`);
  };

  const downloadJson = () => {
    const currentTable = tables[activeTableIdx];
    if (!currentTable) return;

    const headers = currentTable.rows[0];
    const dataRows = currentTable.rows.slice(1);
    const jsonRecords = dataRows.map(r => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h || `Field_${idx + 1}`] = r[idx] || '';
      });
      return obj;
    });

    const blob = new Blob([JSON.stringify(jsonRecords, null, 2)], { type: 'application/json' });
    triggerBlobDownload(blob, `${file?.name.replace(/\.pdf$/i, '')}_Table_${activeTableIdx + 1}.json`);
  };

  const copyMarkdown = () => {
    const currentTable = tables[activeTableIdx];
    if (!currentTable) return;

    const headers = currentTable.rows[0];
    const headerLine = `| ${headers.join(' | ')} |`;
    const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;
    const dataLines = currentTable.rows.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n');

    const md = `${headerLine}\n${separatorLine}\n${dataLines}`;
    navigator.clipboard.writeText(md);
    setCopiedFormat('markdown');
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  const reset = () => {
    setFile(null);
    setTables([]);
    setActiveTableIdx(0);
  };

  const activeTable = tables[activeTableIdx];
  const stageKey = !file ? 'upload' : busy ? 'scanning' : tables.length === 0 ? 'empty' : 'studio';

  return (
    <ToolWorkspaceShell
      title="PDF Table Extractor & Spreadsheet Studio"
      subtitle="Extract tabular data from any PDF with Camelot-py accuracy. Live editable grid, cell editing, and 1-click export to Excel (.xlsx), CSV, JSON, and Markdown."
      categoryLabel="Structured Data & Spreadsheets"
      icon={FileSpreadsheet}
      microVariant="convert"
      tone="emerald"
      trustNote="Camelot-py ML lattice detection · 100% private client spatial fallback"
    >
      <PearlStageSwitch stageKey={stageKey}>
        {!file ? (
          <div className="w-full max-w-2xl mx-auto space-y-6">
            {/* Engine Selector */}
            <div className="pms-glass-panel flex p-1.5 rounded-2xl max-w-md mx-auto">
              {[
                { id: 'camelot', label: 'Camelot-py ML', icon: Server, iconColor: 'text-emerald-600 dark:text-emerald-400' },
                { id: 'spatial', label: 'Client Spatial (Private)', icon: Cpu, iconColor: 'text-[var(--pms-blue)]' },
              ].map(eng => {
                const active = engineMode === eng.id;
                return (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => setEngineMode(eng.id as 'camelot' | 'spatial')}
                    className={`relative flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      active ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="table-engine-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-[var(--pms-border)]"
                      />
                    )}
                    <eng.icon className={`relative z-10 w-3.5 h-3.5 ${eng.iconColor}`} />
                    <span className="relative z-10">{eng.label}</span>
                  </button>
                );
              })}
            </div>

            <FileDropzone
              onDrop={handleDrop}
              multiple={false}
              title="Select PDF Document to Extract Tables"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {[
                {
                  icon: Table,
                  tint: 'bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300',
                  title: 'Interactive Editor',
                  desc: 'Edit cells, add rows, and tune columns before downloading.',
                },
                {
                  icon: FileDown,
                  tint: 'bg-[var(--pms-soft-blue)] text-[var(--pms-blue)]',
                  title: 'Native Excel .xlsx',
                  desc: 'Multi-sheet Excel workbook export with zero format degradation.',
                },
                {
                  icon: FileCode,
                  tint: 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]',
                  title: 'CSV & JSON Ready',
                  desc: 'Instant export for database import, pandas, and data science.',
                },
              ].map((card, idx) => (
                <motion.div
                  key={card.title}
                  initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: idx * 0.06 }}
                  whileHover={prefersReduced ? undefined : { y: -3 }}
                  className="pms-glass-panel p-5 rounded-2xl text-center"
                >
                  <div className={`w-10 h-10 rounded-xl ${card.tint} flex items-center justify-center mx-auto mb-2.5`}>
                    <card.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">{card.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{card.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        ) : busy ? (
          <div className="relative max-w-lg mx-auto pms-glass-panel rounded-3xl p-12 text-center space-y-4 overflow-hidden">
            <PearlScanOverlay active={busy} label={statusMsg || 'Extracting tables from document…'} />
            <div className="w-14 h-14 rounded-2xl bg-[var(--pms-soft-mint)] text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <p className="text-lg font-extrabold text-slate-900 dark:text-white">
              {statusMsg || 'Extracting tables from document…'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Parsing rows, lattice boundaries, and data cells</p>
          </div>
        ) : tables.length === 0 ? (
          <div className="w-full max-w-lg mx-auto pms-glass-panel rounded-3xl p-10 text-center space-y-4">
            <div className="w-12 h-12 bg-[var(--pms-soft-rose)] text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto">
              <Table className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">No Structured Tables Detected</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              We could not detect clear grid or column-aligned tables in this PDF. Try switching between Camelot-py and Client Spatial modes, or upload a document with clear borders.
            </p>
            <button
              onClick={reset}
              className="px-5 py-2.5 bg-white/80 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 border border-[var(--pms-border)] text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Choose Another File
            </button>
          </div>
        ) : (
          <div className="w-full space-y-5">
            {/* Metric Tiles */}
            <div className="grid grid-cols-3 gap-3.5">
              {[
                { label: 'Detected Tables', val: tables.length, tint: 'bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-300' },
                { label: 'Active Rows', val: activeTable?.rows.length || 0, tint: 'bg-[var(--pms-soft-blue)] text-[var(--pms-blue)]' },
                { label: 'Active Columns', val: activeTable?.rows[0]?.length || 0, tint: 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]' },
              ].map((m, idx) => (
                <motion.div
                  key={m.label}
                  initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.04 }}
                  className="pms-glass-panel rounded-2xl p-4"
                >
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${m.tint} mb-1`}>
                    {m.label}
                  </span>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white">
                    <AnimatedNumber value={m.val} />
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Top Actions & Tabs */}
            <div className="pms-glass-panel flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-2xl">
              <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 md:pb-0">
                {tables.map((t, idx) => {
                  const active = idx === activeTableIdx;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTableIdx(idx)}
                      className={`relative py-2 px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? 'text-white'
                          : 'bg-white/75 dark:bg-slate-900/75 border border-[var(--pms-border)] text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="table-sheet-tab"
                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          className="absolute inset-0 rounded-xl bg-emerald-600 shadow-sm"
                        />
                      )}
                      <span className="relative z-10">{t.name} ({t.rows.length} rows)</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <motion.button
                  whileHover={prefersReduced ? undefined : { scale: 1.02 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.98 }}
                  onClick={downloadExcel}
                  className="pms-btn-primary py-2 px-3.5 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Export Excel (.xlsx)
                </motion.button>
                <button
                  onClick={downloadCsv}
                  className="py-2 px-3 bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] border border-[var(--pms-border)] hover:brightness-95 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
                <button
                  onClick={downloadJson}
                  className="py-2 px-3 bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] border border-[var(--pms-border)] hover:brightness-95 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> JSON
                </button>
                <button
                  onClick={copyMarkdown}
                  className="py-2 px-3 bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-800 border border-[var(--pms-border)] text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedFormat === 'markdown' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedFormat === 'markdown' ? 'Copied MD' : 'Copy MD'}
                </button>
                <button
                  onClick={reset}
                  className="py-2 px-3 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs font-semibold cursor-pointer"
                >
                  New File
                </button>
              </div>
            </div>

            {/* Grid Toolbar */}
            {activeTable && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 px-1">
                <span>
                  Editing <strong><AnimatedNumber value={activeTable.rows.length} /></strong> rows &times; <strong><AnimatedNumber value={activeTable.rows[0]?.length || 0} /></strong> columns. Click any cell to edit.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={addRow}
                    className="py-1.5 px-3 bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-800 border border-[var(--pms-border)] text-slate-700 dark:text-slate-200 font-semibold rounded-xl flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-600" /> Add Row
                  </button>
                  <button
                    onClick={addColumn}
                    className="py-1.5 px-3 bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-800 border border-[var(--pms-border)] text-slate-700 dark:text-slate-200 font-semibold rounded-xl flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-600" /> Add Column
                  </button>
                </div>
              </div>
            )}

            {/* Live Editable Spreadsheet Grid */}
            {activeTable && (
              <div className="pms-glass-panel rounded-3xl p-4 sm:p-5">
                <div className="bg-white/75 dark:bg-slate-900/75 rounded-2xl border border-[var(--pms-border)] overflow-hidden">
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-slate-100/90 dark:bg-slate-800/90 sticky top-0 border-b border-[var(--pms-border)] z-10">
                          <th className="py-2.5 px-3 w-10 text-center font-bold text-slate-400 border-r border-[var(--pms-border)]">#</th>
                          {activeTable.rows[0]?.map((header, colIdx) => (
                            <th
                              key={colIdx}
                              className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-100 border-r border-[var(--pms-border)] min-w-[140px]"
                            >
                              <input
                                type="text"
                                value={header}
                                onChange={(e) => updateCell(0, colIdx, e.target.value)}
                                className="bg-transparent font-bold w-full outline-none focus:bg-white dark:focus:bg-slate-900 px-1.5 py-0.5 rounded"
                              />
                            </th>
                          ))}
                          <th className="py-2.5 px-2 w-12 text-center font-bold text-slate-400">Del</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence initial={false}>
                          {activeTable.rows.slice(1).map((row, rowIdx) => {
                            const actualRowIdx = rowIdx + 1;
                            return (
                              <motion.tr
                                key={`${activeTable.id}-r-${actualRowIdx}`}
                                initial={prefersReduced ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={prefersReduced ? undefined : { opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="border-b border-[var(--pms-border)] hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                              >
                                <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-[var(--pms-border)]">
                                  {actualRowIdx}
                                </td>
                                {row.map((cellVal, colIdx) => (
                                  <td
                                    key={colIdx}
                                    className="py-1 px-2 border-r border-[var(--pms-border)]"
                                  >
                                    <input
                                      type="text"
                                      value={cellVal}
                                      onChange={(e) => updateCell(actualRowIdx, colIdx, e.target.value)}
                                      className="bg-transparent w-full outline-none focus:bg-white dark:focus:bg-slate-900 px-1.5 py-1 rounded text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500"
                                    />
                                  </td>
                                ))}
                                <td className="py-2 px-2 text-center">
                                  <button
                                    onClick={() => deleteRow(actualRowIdx)}
                                    title="Delete row"
                                    className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 mx-auto" />
                                  </button>
                                </td>
                              </motion.tr>
                            );
                          })}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </PearlStageSwitch>
    </ToolWorkspaceShell>
  );
}
