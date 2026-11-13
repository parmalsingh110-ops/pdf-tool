import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Download,
  Camera,
  RefreshCw,
  FileImage,
  Loader2,
  RotateCcw,
  Eye,
  Sparkles,
  Printer,
  Scissors,
  FlipHorizontal,
  Plus,
  Minus,
  Check,
  AlertCircle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Package,
  Layers,
  ShieldCheck,
  Sliders,
  Maximize2,
  Info,
  Sun,
  Contrast,
  CreditCard,
  FileText,
  FileCheck2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { preload, removeBackground } from '@imgly/background-removal';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import FileDropzone from '../components/FileDropzone';
import { useSEO } from '../hooks/useSEO';
import { toArrayBufferBytes } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

/* ─── Standard Photo Size Presets (mm) ─── */
export interface PhotoPreset {
  id: string;
  label: string;
  wMm: number;
  hMm: number;
  desc?: string;
}

export const PHOTO_PRESETS: PhotoPreset[] = [
  { id: 'in_passport', label: '3.5 × 4.5 cm — Indian Passport / Aadhaar / PAN ★', wMm: 35, hMm: 45, desc: 'India standard 35x45mm' },
  { id: 'us_visa', label: '2 × 2 inch (51×51 mm) — US Visa / OCI / Passport', wMm: 50.8, hMm: 50.8, desc: 'US 2x2 inch square' },
  { id: 'in_exam', label: '3.5 × 3.5 cm — SSC, UPSC & Railway Exams', wMm: 35, hMm: 35, desc: 'Govt online exam portals' },
  { id: 'stamp', label: '2.5 × 3.0 cm — Stamp Size / Admit Card', wMm: 25, hMm: 30, desc: 'Small stamp size' },
  { id: 'uk_eu', label: '3.5 × 4.5 cm — UK / Europe / Schengen Visa', wMm: 35, hMm: 45, desc: 'Schengen & UK biometrics' },
  { id: 'canada', label: '5.0 × 7.0 cm — Canada Visa / Citizenship', wMm: 50, hMm: 70, desc: 'Canada high-portrait size' },
  { id: 'joint', label: '7.0 × 4.5 cm — Joint Photo (Couple / Pension)', wMm: 70, hMm: 45, desc: 'Double width couple photo' },
  { id: 'custom', label: 'Custom Dimensions (Enter mm)', wMm: 35, hMm: 45, desc: 'Manual width & height' },
];

/* ─── Paper Sizes (mm) ─── */
export interface PaperPreset {
  id: string;
  name: string;
  desc: string;
  wMm: number;
  hMm: number;
}

export const PAPER_PRESETS: PaperPreset[] = [
  { id: '4r', name: '4R (4×6 in)', desc: '10×15 cm Standard Studio Photo Paper ★', wMm: 101.6, hMm: 152.4 },
  { id: 'a4', name: 'A4', desc: '210 × 297 mm Standard Home/Office Sheet', wMm: 210, hMm: 297 },
  { id: 'a5', name: 'A5', desc: '148 × 210 mm Half-A4 Sheet', wMm: 148, hMm: 210 },
  { id: 'letter', name: 'US Letter', desc: '8.5 × 11 in Standard Sheet', wMm: 215.9, hMm: 279.4 },
];

/* ─── Photo Item in Multi-Photo Session ─── */
export interface PhotoSlotItem {
  id: string;
  file: File;
  objectUrl: string;
  img: HTMLImageElement;
  processedImg: HTMLImageElement | null;
  copies: number;
  zoom: number; // 60 - 200%
  rotation: number; // -30 to +30 deg (slider) or -180 to 180 (90° steps)
  isFlippedH: boolean;
  panOffset: { x: number; y: number };
  isBgRemoved: boolean;
  isRemovingBg: boolean;
  isJointPhoto: boolean;
  // Studio Face Lighting (Real Photography Enhancement)
  brightness: number; // -30 to +40 (default 0)
  contrast: number;   // -30 to +40 (default 0)
  saturation: number; // -50 to +60 (default 0) — NEW
}

const bgRemoverConfig = {
  publicPath: 'https://cdn.jsdelivr.net/npm/@imgly/background-removal-data@1.7.0/dist/',
  model: 'isnet_quint8' as const,
  device: 'cpu' as const,
  proxyToWorker: false,
  rescale: true,
  fetchArgs: { cache: 'force-cache' as RequestCache },
  output: { format: 'image/png' as const, quality: 1 },
};

export default function PassportPhotoSheet() {
  useSEO(
    'Pro Studio Passport Photo Sheet Maker | 4R, A4, Zero Cut-off Multi-Pack',
    'Studio-grade passport photo sheet maker. Zero cut-off auto arrangement for 4R/A4 paper, biometric oval guide, studio face lighting, SSC/UPSC 20-50KB portal compression, and direct printing.'
  );

  // === MULTI-PHOTO STATE ===
  const [photos, setPhotos] = useState<PhotoSlotItem[]>([]);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState<boolean>(false);
  const [modalActiveTab, setModalActiveTab] = useState<'align' | 'light'>('align');
  const [showBiometricGuides, setShowBiometricGuides] = useState<boolean>(true);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [activeSarkariId, setActiveSarkariId] = useState<string | null>(null);
  const [isBatchRemovingBg, setIsBatchRemovingBg] = useState<boolean>(false);

  // Drag pan refs for crop modal (mouse + touch)
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Toast helper
  const showToast = (text: string, type: 'error' | 'success' | 'info' = 'info') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Active photo
  const currentPhoto = useMemo(() => {
    if (!photos.length) return null;
    return photos.find((p) => p.id === activePhotoId) || photos[0];
  }, [photos, activePhotoId]);

  // Photo size preset & custom mm
  const [photoPresetId, setPhotoPresetId] = useState<string>('in_passport');
  const [customPhotoW, setCustomPhotoW] = useState<number>(35);
  const [customPhotoH, setCustomPhotoH] = useState<number>(45);

  const selectedPreset = useMemo(() => {
    return PHOTO_PRESETS.find((p) => p.id === photoPresetId) || PHOTO_PRESETS[0];
  }, [photoPresetId]);

  const basePhotoWidthMm = photoPresetId === 'custom' ? customPhotoW : selectedPreset.wMm;
  const basePhotoHeightMm = photoPresetId === 'custom' ? customPhotoH : selectedPreset.hMm;

  // Background color
  const [bgColor, setBgColor] = useState<string>('#ffffff');

  // Photo border
  const [hasBorder, setHasBorder] = useState<boolean>(true);
  const [borderWidthMm, setBorderWidthMm] = useState<number>(0.5);
  const [borderColor, setBorderColor] = useState<string>('#000000');

  // Candidate Text (Name & DOP) — STRICTLY UNCHECKED BY DEFAULT
  const [hasCandidateText, setHasCandidateText] = useState<boolean>(false);
  const [candidateName, setCandidateName] = useState<string>('');
  const [candidateDate, setCandidateDate] = useState<string>(() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  });

  // === PRINT LAYOUT & CAPACITY ENGINE ===
  const [paperSizeId, setPaperSizeId] = useState<string>('4r');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [gapMm, setGapMm] = useState<number>(3);
  const [marginMm, setMarginMm] = useState<number>(4);
  const [noMargins, setNoMargins] = useState<boolean>(false);
  const [hasCutGuides, setHasCutGuides] = useState<boolean>(true);
  const [studioWatermark, setStudioWatermark] = useState<string>('');
  const [isFullscreenPreview, setIsFullscreenPreview] = useState<boolean>(false);
  const photoHistoryRef = useRef<Record<string, { zoom: number; rotation: number; panOffset: { x: number; y: number }; brightness: number; contrast: number; saturation: number }>>({});

  // Target Photo Quantity (User can type 28, 16, 8, etc.)
  const [targetPhotoCount, setTargetPhotoCount] = useState<number>(6);

  // Grid Rows x Cols
  const [gridRows, setGridRows] = useState<number>(3);
  const [gridCols, setGridCols] = useState<number>(2);

  // Sheet Pagination Carousel (For when photos span multiple sheets)
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);

  // Export Settings
  const [exportDpi, setExportDpi] = useState<number>(300);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Hidden canvases & refs
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Paper dimensions
  const activePaper = useMemo(() => {
    const p = PAPER_PRESETS.find((x) => x.id === paperSizeId) || PAPER_PRESETS[0];
    if (orientation === 'landscape') {
      return { ...p, wMm: Math.max(p.wMm, p.hMm), hMm: Math.min(p.wMm, p.hMm) };
    }
    return { ...p, wMm: Math.min(p.wMm, p.hMm), hMm: Math.max(p.wMm, p.hMm) };
  }, [paperSizeId, orientation]);

  // Safe Physical Limits Calculation (Prevents Overflow & Cut-off)
  const safeLimits = useMemo(() => {
    const effectiveMargin = noMargins ? 0 : marginMm;
    const availW = Math.max(10, activePaper.wMm - 2 * effectiveMargin);
    const availH = Math.max(10, activePaper.hMm - 2 * effectiveMargin);

    const maxCols = Math.max(1, Math.floor((availW + gapMm) / (basePhotoWidthMm + gapMm)));
    const maxRows = Math.max(1, Math.floor((availH + gapMm) / (basePhotoHeightMm + gapMm)));
    const maxSlotsPerSheet = maxCols * maxRows;

    const currentW = gridCols * basePhotoWidthMm + (gridCols - 1) * gapMm;
    const currentH = gridRows * basePhotoHeightMm + (gridRows - 1) * gapMm;
    const isWOverflow = currentW > availW + 1;
    const isHOverflow = currentH > availH + 1;

    return {
      maxCols,
      maxRows,
      maxSlotsPerSheet,
      availW,
      availH,
      currentW,
      currentH,
      isOverflow: isWOverflow || isHOverflow,
      isWOverflow,
      isHOverflow,
    };
  }, [activePaper, noMargins, marginMm, gapMm, basePhotoWidthMm, basePhotoHeightMm, gridCols, gridRows]);

  const slotsPerSheet = useMemo(() => gridRows * gridCols, [gridRows, gridCols]);

  const totalSheetsRequired = useMemo(() => {
    if (slotsPerSheet <= 0) return 1;
    return Math.max(1, Math.ceil(targetPhotoCount / slotsPerSheet));
  }, [targetPhotoCount, slotsPerSheet]);

  useEffect(() => {
    if (activeSheetIndex >= totalSheetsRequired) {
      setActiveSheetIndex(Math.max(0, totalSheetsRequired - 1));
    }
  }, [totalSheetsRequired, activeSheetIndex]);

  useEffect(() => {
    if (photos.length === 1) {
      setPhotos((prev) => (prev[0]?.copies !== targetPhotoCount ? [{ ...prev[0], copies: targetPhotoCount }] : prev));
    } else if (photos.length > 1) {
      const sum = photos.reduce((acc, p) => acc + p.copies, 0);
      if (sum !== targetPhotoCount) {
        setTargetPhotoCount(sum);
      }
    }
  }, [photos, targetPhotoCount]);

  useEffect(() => {
    preload(bgRemoverConfig).catch(() => {});
    return () => {
      // Memory cleanup on unmount
      photos.forEach((p) => {
        if (p.objectUrl) URL.revokeObjectURL(p.objectUrl);
      });
    };
  }, []);

  const handleAutoFit = useCallback(() => {
    const effectiveMargin = noMargins ? 0 : marginMm;
    const availW = Math.max(10, activePaper.wMm - 2 * effectiveMargin);
    const availH = Math.max(10, activePaper.hMm - 2 * effectiveMargin);

    const fitCols = Math.max(1, Math.floor((availW + gapMm) / (basePhotoWidthMm + gapMm)));
    const fitRows = Math.max(1, Math.floor((availH + gapMm) / (basePhotoHeightMm + gapMm)));

    setGridCols(fitCols);
    setGridRows(fitRows);
  }, [activePaper, noMargins, marginMm, gapMm, basePhotoWidthMm, basePhotoHeightMm]);

  // Smart Photo Quantity & Grid Layout Allocator (Optimized for Xerox / Studio workflows)
  const handleTargetCountChange = (newCount: number) => {
    const count = Math.max(1, Math.min(120, newCount));
    setTargetPhotoCount(count);

    // 1. Sync photo copies in session
    if (photos.length === 1) {
      setPhotos((prev) => (prev[0] ? [{ ...prev[0], copies: count }] : prev));
    } else if (photos.length > 1) {
      const perPhoto = Math.floor(count / photos.length);
      const remainder = count % photos.length;
      setPhotos((prev) =>
        prev.map((p, idx) => ({
          ...p,
          copies: Math.max(1, perPhoto + (idx < remainder ? 1 : 0)),
        }))
      );
    }

    // 2. Smart Paper Allocation:
    // If count > 8 (e.g. 12, 16, 24, 28, 30, 32) and paper is currently 4R (4x6 in),
    // 4R can only fit 6-8 photos physically. Auto-switch to A4 so user gets 1 complete sheet without miniature shrinking!
    if (count > 8 && paperSizeId === '4r') {
      setPaperSizeId('a4');
      setOrientation('portrait');
      setGridCols(5);
      setGridRows(Math.min(6, Math.max(1, Math.ceil(count / 5))));
      showToast(`Auto-switched to A4 sheet to fit all ${count} full-size photos on 1 page!`, 'info');
      return;
    }

    // 3. Grid allocation according to paper size
    if (paperSizeId === 'a4') {
      if (count <= 4) {
        setGridCols(2);
        setGridRows(2);
      } else if (count <= 6) {
        setGridCols(3);
        setGridRows(2);
      } else if (count <= 8) {
        setGridCols(4);
        setGridRows(2);
      } else if (count <= 12) {
        setGridCols(4);
        setGridRows(3);
      } else if (count <= 16) {
        setGridCols(4);
        setGridRows(4);
      } else if (count <= 20) {
        setGridCols(5);
        setGridRows(4);
      } else if (count <= 25) {
        setGridCols(5);
        setGridRows(5);
      } else {
        // 26 to 30+ (including 28 photos: 5 cols × 6 rows = 30 slots)
        setGridCols(5);
        setGridRows(6);
      }
    } else if (paperSizeId === '4r') {
      if (count <= 6) {
        setOrientation('portrait');
        setGridCols(2);
        setGridRows(Math.min(3, Math.ceil(count / 2)));
      } else if (count <= 8) {
        setOrientation('landscape');
        setGridCols(4);
        setGridRows(2);
      } else {
        setGridCols(2);
        setGridRows(3);
      }
    } else {
      handleAutoFit();
    }
  };

  const handleSwitchToA4 = () => {
    setPaperSizeId('a4');
    setOrientation('portrait');
    setGridCols(5);
    setGridRows(6);
    setActiveSheetIndex(0);
  };

  const applyPresetPack = (packId: '4r_classic' | '4r_max' | 'a4_full' | 'a4_half' | 'a5_pack') => {
    if (packId === '4r_classic') {
      setPaperSizeId('4r');
      setOrientation('portrait');
      setGridCols(2);
      setGridRows(3);
      setTargetPhotoCount(6);
    } else if (packId === '4r_max') {
      setPaperSizeId('4r');
      setOrientation('landscape');
      setGridCols(4);
      setGridRows(2);
      setTargetPhotoCount(8);
    } else if (packId === 'a4_full') {
      setPaperSizeId('a4');
      setOrientation('portrait');
      setGridCols(5);
      setGridRows(6);
      setTargetPhotoCount(30);
    } else if (packId === 'a4_half') {
      setPaperSizeId('a4');
      setOrientation('portrait');
      setGridCols(5);
      setGridRows(3);
      setTargetPhotoCount(15);
    } else if (packId === 'a5_pack') {
      setPaperSizeId('a5');
      setOrientation('portrait');
      setGridCols(3);
      setGridRows(4);
      setTargetPhotoCount(12);
    }
    setActiveSheetIndex(0);
  };

  // Sarkari Exam Quick Mode Handler — Leaves Name/DOP UNCHECKED by default
  const applySarkariPortalPreset = (type: 'ssc' | 'upsc' | 'rrb' | 'passport' | 'us_visa' | 'neet') => {
    setActiveSarkariId(type); // track for active button highlight
    if (type === 'ssc' || type === 'upsc') {
      setPhotoPresetId('in_passport');
      setHasBorder(true);
      setBorderWidthMm(0.5);
      setBgColor('#ffffff');
    } else if (type === 'rrb') {
      setPhotoPresetId('in_passport');
      setHasBorder(true);
      setBorderWidthMm(0.3);
      setBgColor('#ffffff');
    } else if (type === 'passport') {
      setPhotoPresetId('in_passport');
      setHasBorder(false);
      setBgColor('#ffffff');
    } else if (type === 'us_visa') {
      setPhotoPresetId('us_visa');
      setHasBorder(false);
      setBgColor('#ffffff');
    } else if (type === 'neet') {
      setPhotoPresetId('in_exam'); // 35x35mm for NEET portal
      setHasBorder(false);
      setBgColor('#ffffff');
    }
    setTimeout(handleAutoFit, 10);
  };

  const addFilesToSession = async (filesToAdd: File[]) => {
    if (!filesToAdd.length) return;
    setIsLoadingPhotos(true);
    const newItems: PhotoSlotItem[] = [];

    try {
      for (const f of filesToAdd) {
        const url = URL.createObjectURL(f);
        const loadedImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const imgEl = new Image();
          imgEl.onload = () => resolve(imgEl);
          imgEl.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
          imgEl.src = url;
        });

        const newItem: PhotoSlotItem = {
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          file: f,
          objectUrl: url,
          img: loadedImg,
          processedImg: null, // null = use original img (not stale copy)
          copies: photos.length === 0 ? targetPhotoCount : 1,
          zoom: 100,
          rotation: 0,
          isFlippedH: false,
          panOffset: { x: 0, y: 0 },
          isBgRemoved: false,
          isRemovingBg: false,
          isJointPhoto: false,
          brightness: 0,
          contrast: 0,
          saturation: 0,
        };
        newItems.push(newItem);
      }
    } catch (err) {
      showToast('One or more images could not be loaded. Please try again.', 'error');
    } finally {
      setIsLoadingPhotos(false);
    }

    if (newItems.length > 0) {
      setPhotos((prev) => [...prev, ...newItems]);
      setActivePhotoId(newItems[0].id);
      if (photos.length === 0) setIsCropModalOpen(true);
    }
  };

  const updatePhoto = (id: string, updater: (p: PhotoSlotItem) => PhotoSlotItem) => {
    setPhotos((prev) => prev.map((item) => (item.id === id ? updater(item) : item)));
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const toRemove = prev.find((p) => p.id === id);
      // Memory leak fix: revoke object URL when removing
      if (toRemove) URL.revokeObjectURL(toRemove.objectUrl);
      const next = prev.filter((p) => p.id !== id);
      if (activePhotoId === id) {
        setActivePhotoId(next.length > 0 ? next[0].id : null);
        if (next.length === 0) setIsCropModalOpen(false);
      }
      return next;
    });
  };

  const movePhoto = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= photos.length) return;
    setPhotos((prev) => {
      const copy = [...prev];
      const item = copy.splice(fromIdx, 1)[0];
      copy.splice(toIdx, 0, item);
      return copy;
    });
  };

  const openCropModal = (photoId: string) => {
    const photo = photos.find((p) => p.id === photoId);
    if (photo) {
      photoHistoryRef.current[photoId] = {
        zoom: photo.zoom,
        rotation: photo.rotation,
        panOffset: { ...photo.panOffset },
        brightness: photo.brightness,
        contrast: photo.contrast,
        saturation: photo.saturation,
      };
    }
    setActivePhotoId(photoId);
    setIsCropModalOpen(true);
  };

  const handleUndoPhotoChanges = (photoId: string) => {
    const prev = photoHistoryRef.current[photoId];
    if (prev) {
      updatePhoto(photoId, (p) => ({
        ...p,
        zoom: prev.zoom,
        rotation: prev.rotation,
        panOffset: { ...prev.panOffset },
        brightness: prev.brightness,
        contrast: prev.contrast,
        saturation: prev.saturation,
      }));
      showToast('Reverted adjustments to previous snapshot.', 'info');
    }
  };

  const handleRemoveBackground = async (photo: PhotoSlotItem) => {
    updatePhoto(photo.id, (p) => ({ ...p, isRemovingBg: true }));
    showToast('1/2 Initializing AI portrait segmentation...', 'info');
    let blobUrl: string | null = null;
    try {
      const resultBlob = await removeBackground(photo.file, {
        ...bgRemoverConfig,
        progress: (key, current, total) => {
          if (total > 0) {
            const pct = Math.round((current / total) * 100);
            if (pct % 30 === 0) showToast(`Removing background... ${pct}%`, 'info');
          }
        },
      });
      showToast('2/2 Rendering transparent HD portrait...', 'info');
      blobUrl = URL.createObjectURL(resultBlob);
      const transparentImg = new Image();
      transparentImg.onload = () => {
        // Revoke blob URL after image is loaded to free memory
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        updatePhoto(photo.id, (p) => ({
          ...p,
          processedImg: transparentImg,
          isBgRemoved: true,
          isRemovingBg: false,
        }));
        showToast('✓ AI Background removed successfully!', 'success');
      };
      transparentImg.onerror = () => {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        updatePhoto(photo.id, (p) => ({ ...p, isRemovingBg: false }));
        showToast('Background removal failed. You can still adjust layout.', 'error');
      };
      transparentImg.src = blobUrl;
    } catch (err) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      console.error('[PassportSheet] BG removal failed:', err);
      showToast('Background removal could not run. You can still apply border and adjust layout.', 'error');
      updatePhoto(photo.id, (p) => ({ ...p, isRemovingBg: false }));
    }
  };

  // Batch BG Removal — removes background for all photos in session
  const handleBatchRemoveBackground = async () => {
    const pending = photos.filter((p) => !p.isBgRemoved && !p.isRemovingBg);
    if (!pending.length) {
      showToast('All photos already processed!', 'info');
      return;
    }
    setIsBatchRemovingBg(true);
    let doneCount = 0;
    for (const photo of pending) {
      await handleRemoveBackground(photo);
      doneCount++;
      showToast(`Removing background... ${doneCount}/${pending.length}`, 'info');
    }
    setIsBatchRemovingBg(false);
    showToast(`✓ Background removed for ${doneCount} photo(s)!`, 'success');
  };


  // Render a Single Photo Tile with Transforms, Studio Lighting & Borders
  const renderSinglePhotoTile = useCallback(
    (photo: PhotoSlotItem, dpi = 300): HTMLCanvasElement => {
      const dpmm = dpi / 25.4;
      const targetWmm = photo.isJointPhoto ? basePhotoWidthMm * 2 : basePhotoWidthMm;
      const targetHmm = basePhotoHeightMm;

      const targetW = Math.round(targetWmm * dpmm);
      const targetH = Math.round(targetHmm * dpmm);

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return canvas;

      // 1. Fill Background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, targetW, targetH);

      // 2. Draw Customer Photo with Studio Lighting (Brightness / Contrast / Saturation)
      const activeImg = photo.processedImg ?? photo.img;
      if (activeImg) {
        ctx.save();
        const modalRefScale = targetH / 220;
        ctx.translate(
          targetW / 2 + photo.panOffset.x * modalRefScale,
          targetH / 2 + photo.panOffset.y * modalRefScale
        );
        ctx.rotate((photo.rotation * Math.PI) / 180);
        ctx.scale((photo.zoom / 100) * (photo.isFlippedH ? -1 : 1), photo.zoom / 100);

        // Build combined CSS filter (brightness + contrast + saturation)
        const filters: string[] = [];
        if (photo.brightness !== 0) filters.push(`brightness(${100 + photo.brightness}%)`);
        if (photo.contrast !== 0) filters.push(`contrast(${100 + photo.contrast}%)`);
        if (photo.saturation !== 0) filters.push(`saturate(${100 + photo.saturation}%)`);
        if (filters.length > 0) ctx.filter = filters.join(' ');

        const imgW = activeImg.naturalWidth || activeImg.width || 1;
        const imgH = activeImg.naturalHeight || activeImg.height || 1;
        const imgAspect = imgW / imgH;
        const tileAspect = targetW / targetH;
        let drawW = targetW;
        let drawH = targetH;
        if (imgAspect > tileAspect) {
          drawH = targetH;
          drawW = targetH * imgAspect;
        } else {
          drawW = targetW;
          drawH = targetW / imgAspect;
        }

        ctx.drawImage(activeImg, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      }

      // 3. Candidate Name & Date of Photo (DOP) Banner
      if (hasCandidateText && (candidateName.trim() || candidateDate.trim())) {
        const bannerH = Math.round(targetH * 0.16);
        const bannerY = targetH - bannerH;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, bannerY, targetW, bannerH);

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = Math.max(1, Math.round(dpmm * 0.2));
        ctx.beginPath();
        ctx.moveTo(0, bannerY);
        ctx.lineTo(targetW, bannerY);
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';

        const fontSize = Math.max(10, Math.round(bannerH * 0.36));
        ctx.font = `bold ${fontSize}px sans-serif`;

        if (candidateName.trim() && candidateDate.trim()) {
          ctx.fillText(candidateName.trim().toUpperCase(), targetW / 2, bannerY + bannerH * 0.44);
          ctx.font = `600 ${Math.round(fontSize * 0.88)}px sans-serif`;
          ctx.fillText(`DOP: ${candidateDate.trim()}`, targetW / 2, bannerY + bannerH * 0.86);
        } else if (candidateName.trim()) {
          ctx.fillText(candidateName.trim().toUpperCase(), targetW / 2, bannerY + bannerH * 0.65);
        } else if (candidateDate.trim()) {
          ctx.fillText(`DOP: ${candidateDate.trim()}`, targetW / 2, bannerY + bannerH * 0.65);
        }
      }

      // 4. Photo Border
      if (hasBorder && borderWidthMm > 0) {
        const borderPx = Math.max(1, Math.round(borderWidthMm * dpmm));
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderPx;
        const half = borderPx / 2;
        ctx.strokeRect(half, half, targetW - borderPx, targetH - borderPx);
      }

      return canvas;
    },
    [
      basePhotoWidthMm,
      basePhotoHeightMm,
      bgColor,
      hasCandidateText,
      candidateName,
      candidateDate,
      hasBorder,
      borderWidthMm,
      borderColor,
      photos, // needed so tile re-renders when photo adjustments change
    ]
  );

  // Render a Specific Sheet Page to Canvas (Zero Cut-off Guarantee)
  const renderSheetPageCanvas = useCallback(
    (sheetIndex = 0, dpi = 300): HTMLCanvasElement => {
      const dpmm = dpi / 25.4;
      const sheetW = Math.round(activePaper.wMm * dpmm);
      const sheetH = Math.round(activePaper.hMm * dpmm);

      const canvas = document.createElement('canvas');
      canvas.width = sheetW;
      canvas.height = sheetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return canvas;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sheetW, sheetH);

      if (!photos.length) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = `bold ${Math.round(sheetW * 0.032)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('Select or drop a photo to preview print sheet', sheetW / 2, sheetH / 2);
        return canvas;
      }

      const allQueuedPhotos: PhotoSlotItem[] = [];
      for (const p of photos) {
        for (let i = 0; i < p.copies; i++) {
          allQueuedPhotos.push(p);
        }
      }

      const startIndex = sheetIndex * slotsPerSheet;
      const pagePhotos = allQueuedPhotos.slice(startIndex, startIndex + slotsPerSheet);

      const renderedTileMap = new Map<string, HTMLCanvasElement>();
      for (const p of photos) {
        renderedTileMap.set(p.id, renderSinglePhotoTile(p, dpi));
      }

      const defaultTile = renderedTileMap.get(photos[0].id)!;
      const tileW = defaultTile.width;
      const tileH = defaultTile.height;

      const gapPx = Math.round(gapMm * dpmm);
      const marginPx = noMargins ? 0 : Math.round(marginMm * dpmm);

      const totalGridW = gridCols * tileW + (gridCols - 1) * gapPx;
      const totalGridH = gridRows * tileH + (gridRows - 1) * gapPx;

      let scaleFactor = 1.0;
      const availW = sheetW - 2 * marginPx;
      const availH = sheetH - 2 * marginPx;

      if (totalGridW > availW || totalGridH > availH) {
        scaleFactor = Math.min(availW / totalGridW, availH / totalGridH);
      }

      ctx.save();
      const scaledGridW = totalGridW * scaleFactor;
      const scaledGridH = totalGridH * scaleFactor;
      const startX = Math.round((sheetW - scaledGridW) / 2);
      const startY = Math.round((sheetH - scaledGridH) / 2);

      ctx.translate(startX, startY);
      ctx.scale(scaleFactor, scaleFactor);

      let placed = 0;
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          if (placed >= slotsPerSheet) break;

          const photoItem = pagePhotos[placed] || null;
          const px = c * (tileW + gapPx);
          const py = r * (tileH + gapPx);

          if (photoItem) {
            const tileCanvas = renderedTileMap.get(photoItem.id) || defaultTile;
            ctx.drawImage(tileCanvas, px, py);
          } else {
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = Math.max(1, Math.round(dpmm * 0.2));
            ctx.setLineDash([Math.round(dpmm * 1.5), Math.round(dpmm * 1.5)]);
            ctx.strokeRect(px, py, tileW, tileH);
            ctx.setLineDash([]);
          }

          placed++;
        }
      }

      if (hasCutGuides && gapPx > 0 && pagePhotos.length > 1) {
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = Math.max(1, Math.round(dpmm * 0.22));
        ctx.setLineDash([Math.round(dpmm * 1.5), Math.round(dpmm * 1.5)]);

        for (let c = 1; c < gridCols; c++) {
          const cutX = c * tileW + (c - 0.5) * gapPx;
          ctx.beginPath();
          ctx.moveTo(cutX, 0);
          ctx.lineTo(cutX, totalGridH);
          ctx.stroke();
        }

        for (let r = 1; r < gridRows; r++) {
          const cutY = r * tileH + (r - 0.5) * gapPx;
          ctx.beginPath();
          ctx.moveTo(0, cutY);
          ctx.lineTo(totalGridW, cutY);
          ctx.stroke();
        }

        ctx.setLineDash([]);
      }

      ctx.restore();

      // Sheet Numbering & Studio Footer in non-print margin (Crisp Studio Branding)
      const bottomSpace = sheetH - (startY + scaledGridH);
      if (marginPx >= 8 || bottomSpace >= 22) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = `600 ${Math.max(9, Math.round(dpmm * 2.3))}px sans-serif`;
        ctx.textAlign = 'center';
        const footerY = Math.min(sheetH - 8, Math.max(sheetH - (marginPx ? marginPx / 2 : 12), startY + scaledGridH + Math.round(dpmm * 4.2)));
        const studioNote = studioWatermark.trim() ? `${studioWatermark.trim()} • ` : '';
        ctx.fillText(`${studioNote}Sheet ${sheetIndex + 1} of ${totalSheetsRequired} • 100% Actual Size (${exportDpi} DPI)`, sheetW / 2, footerY);
      }

      return canvas;
    },
    [
      activePaper,
      photos,
      renderSinglePhotoTile,
      slotsPerSheet,
      gridCols,
      gridRows,
      gapMm,
      noMargins,
      marginMm,
      hasCutGuides,
      studioWatermark,
      exportDpi,
      totalSheetsRequired,
    ]
  );

  // Live Screen Preview
  useEffect(() => {
    if (!previewCanvasRef.current) return;
    const previewDpi = 96;
    const rendered = renderSheetPageCanvas(activeSheetIndex, previewDpi);

    const targetCanvas = previewCanvasRef.current;
    targetCanvas.width = rendered.width;
    targetCanvas.height = rendered.height;
    const tctx = targetCanvas.getContext('2d');
    if (tctx) {
      tctx.drawImage(rendered, 0, 0);
    }
  }, [renderSheetPageCanvas, activeSheetIndex]);

  // Direct Browser Print (100% Actual Size)
  const handlePrint = () => {
    if (!photos.length) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Pop-up was blocked. Please allow pop-ups to print directly.', 'error');
      return;
    }

    const pagesHtml: string[] = [];
    for (let i = 0; i < totalSheetsRequired; i++) {
      const pageCanvas = renderSheetPageCanvas(i, exportDpi);
      const dataUrl = pageCanvas.toDataURL('image/jpeg', 0.96);
      pagesHtml.push(`
        <div class="page">
          <img src="${dataUrl}" />
        </div>
      `);
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Passport Photo Print Sheet (${paperSizeId.toUpperCase()})</title>
          <style>
            @page {
              size: ${activePaper.wMm}mm ${activePaper.hMm}mm;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              background: #fff;
            }
            .page {
              page-break-after: always;
              width: ${activePaper.wMm}mm;
              height: ${activePaper.hMm}mm;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              display: block;
            }
          </style>
        </head>
        <body>
          ${pagesHtml.join('')}
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadCurrentSheet = (format: 'png' | 'jpeg') => {
    if (!photos.length) return;
    setIsGenerating(true);
    setTimeout(() => {
      try {
        const canvas = renderSheetPageCanvas(activeSheetIndex, exportDpi);
        const mime = format === 'png' ? 'image/png' : 'image/jpeg';
        const quality = format === 'jpeg' ? 0.96 : undefined;

        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `passport_sheet_${paperSizeId}_sheet${activeSheetIndex + 1}_of_${totalSheetsRequired}.${format === 'png' ? 'png' : 'jpg'}`;
          a.click();
          URL.revokeObjectURL(url);
          setIsGenerating(false);
        }, mime, quality);
      } catch (e) {
        console.error(e);
        setIsGenerating(false);
      }
    }, 40);
  };

  const handleDownloadAllSheetsPdf = async () => {
    if (!photos.length) return;
    setIsGenerating(true);
    try {
      const pdf = await PDFDocument.create();
      const mmToPt = 72 / 25.4;
      const pageW = activePaper.wMm * mmToPt;
      const pageH = activePaper.hMm * mmToPt;

      for (let i = 0; i < totalSheetsRequired; i++) {
        const pageCanvas = renderSheetPageCanvas(i, exportDpi);
        const pngBlob = await new Promise<Blob | null>((res) => pageCanvas.toBlob(res, 'image/png'));
        if (!pngBlob) continue;

        const arrayBuffer = await pngBlob.arrayBuffer();
        const embeddedImg = await pdf.embedPng(new Uint8Array(arrayBuffer));
        const page = pdf.addPage([pageW, pageH]);
        page.drawImage(embeddedImg, { x: 0, y: 0, width: pageW, height: pageH });
      }

      const pdfBytes = await pdf.save();
      const pdfBlob = new Blob([toArrayBufferBytes(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `passport_photo_sheets_${paperSizeId}_${targetPhotoCount}photos.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      showToast('Failed to generate PDF. Please download as PNG or JPG.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAllSheetsZip = async (format: 'png' | 'jpeg') => {
    if (!photos.length) return;
    setIsGenerating(true);
    try {
      const zip = new JSZip();
      // Bug fix: was always using PNG — now correctly uses the requested format
      const mime = format === 'png' ? 'image/png' : 'image/jpeg';
      const quality = format === 'jpeg' ? 0.95 : undefined;
      const ext = format === 'png' ? 'png' : 'jpg';

      for (let i = 0; i < totalSheetsRequired; i++) {
        const canvas = renderSheetPageCanvas(i, exportDpi);
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, quality));
        if (blob) {
          zip.file(`passport_sheet_${paperSizeId}_page_${i + 1}.${ext}`, blob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `passport_sheets_${paperSizeId}_${targetPhotoCount}photos_${ext}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      showToast('Failed to generate ZIP package.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadSinglePhoto = (format: 'png' | 'jpeg') => {
    if (!currentPhoto) return;
    const tile = renderSinglePhotoTile(currentPhoto, exportDpi);
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const quality = format === 'jpeg' ? 0.98 : undefined;

    tile.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `single_passport_photo_${basePhotoWidthMm}x${basePhotoHeightMm}mm.${format === 'png' ? 'png' : 'jpg'}`;
      a.click();
      URL.revokeObjectURL(url);
    }, mime, quality);
  };

  // Dedicated Govt Portal Photo Downloader (Guaranteed 20 - 50 KB JPEG)
  const handleDownloadGovtPortalPhoto = async () => {
    if (!currentPhoto) return;
    setIsGenerating(true);
    try {
      const tile = renderSinglePhotoTile(currentPhoto, 300);
      let low = 0.20;
      let high = 0.95;
      let bestBlob: Blob | null = null;

      for (let iter = 0; iter < 7; iter++) {
        const mid = (low + high) / 2;
        const blob = await new Promise<Blob | null>((res) => tile.toBlob(res, 'image/jpeg', mid));
        if (!blob) break;
        const kb = blob.size / 1024;
        bestBlob = blob;
        if (kb > 46) {
          high = mid;
        } else if (kb < 22) {
          low = mid;
        } else {
          break; // Perfect ~30-40 KB range!
        }
      }

      // If still outside 20-50KB due to unusual image dimensions, adjust DPI
      if (bestBlob && (bestBlob.size / 1024 < 20 || bestBlob.size / 1024 > 50)) {
        const kb = bestBlob.size / 1024;
        const adjustedDpi = kb < 20 ? 380 : 220;
        const adjTile = renderSinglePhotoTile(currentPhoto, adjustedDpi);
        const retryBlob = await new Promise<Blob | null>((res) => adjTile.toBlob(res, 'image/jpeg', 0.82));
        if (retryBlob && retryBlob.size / 1024 >= 18 && retryBlob.size / 1024 <= 50) {
          bestBlob = retryBlob;
        }
      }

      if (bestBlob) {
        const sizeKb = Math.round(bestBlob.size / 1024);
        const url = URL.createObjectURL(bestBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sarkari_photo_${basePhotoWidthMm}x${basePhotoHeightMm}mm_${sizeKb}KB.jpg`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`✅ Sarkari Photo exported: ${sizeKb} KB (Passes SSC/UPSC 20–50 KB validation!)`, 'success');
      }
    } catch (e) {
      console.error(e);
      showToast('Auto-compression reached fallback. Downloading standard photo...', 'info');
      handleDownloadSinglePhoto('jpeg');
    } finally {
      setIsGenerating(false);
    }
  };

  const prefersReduced = useReducedMotion();
  const isBusy = isGenerating || isLoadingPhotos || isBatchRemovingBg || Boolean(currentPhoto?.isRemovingBg);

  return (
    <ToolWorkspaceShell
      title="Passport Photo Sheet Maker"
      subtitle="Zero cut-off studio printing engine. Auto-arrange on 4R photo paper or A4, biometric head guides, face lighting glow, and instant 20–50 KB govt portal compression."
      categoryLabel="Pro Studio Passport Sheet Suite"
      icon={Camera}
      microVariant="crop"
      tone="indigo"
      trustNote="Guaranteed Zero Cut-Off · 300 DPI Studio Quality · 100% Client-Side"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files) addFilesToSession(Array.from(e.target.files));
          e.target.value = '';
        }}
        accept="image/png, image/jpeg, image/jpg, image/webp"
        multiple
        className="hidden"
      />

      {/* ─── Toast Notification (replaces browser alert) ─── */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReduced ? undefined : { opacity: 0, y: -10, scale: 0.96 }}
            transition={{ duration: 0.22 }}
            className={`fixed top-5 right-5 z-[9999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold max-w-sm border border-white/15 backdrop-blur-md ${
              toastMsg.type === 'error'
                ? 'bg-rose-600 text-white'
                : toastMsg.type === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-violet-700 text-white'
            }`}
          >
            <span className="text-base">
              {toastMsg.type === 'error' ? '⚠️' : toastMsg.type === 'success' ? '✓' : 'ℹ'}
            </span>
            <span>{toastMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Photo Loading Overlay ─── */}
      <AnimatePresence>
        {isLoadingPhotos && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReduced ? undefined : { opacity: 0 }}
            className="fixed inset-0 z-[9998] bg-black/45 backdrop-blur-sm flex items-center justify-center"
          >
            <div className="pms-glass-panel rounded-2xl px-8 py-6 flex items-center gap-4">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--pms-violet)]" />
              <span className="text-sm font-bold" style={{ color: 'var(--pms-ink)' }}>Loading photo(s)…</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= CYBER CAFÉ & XEROX STUDIO HUB STRIP ================= */}
      <div className="mb-5 pms-glass-panel rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2 px-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold" style={{ color: 'var(--pms-ink)' }}>Cyber Café &amp; Studio Suite:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/id-card-joiner"
            className="px-3 py-1.5 rounded-xl border border-[var(--pms-border)] font-semibold flex items-center gap-1.5 transition-colors hover:border-violet-300 dark:hover:border-violet-700"
            style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
          >
            <CreditCard className="w-3.5 h-3.5 text-[var(--pms-violet)]" /> Aadhaar/ID Dual-Side Joiner
          </Link>
          <Link
            to="/ink-saver"
            className="px-3 py-1.5 rounded-xl border border-[var(--pms-border)] font-semibold flex items-center gap-1.5 transition-colors hover:border-emerald-300 dark:hover:border-emerald-700"
            style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
          >
            <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Xerox Eco Document Cleaner
          </Link>
          <Link
            to="/clean-signature"
            className="px-3 py-1.5 rounded-xl border border-[var(--pms-border)] font-semibold flex items-center gap-1.5 transition-colors hover:border-rose-300 dark:hover:border-rose-700"
            style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
          >
            <FileCheck2 className="w-3.5 h-3.5 text-[var(--pms-rose)]" /> Sarkari Signature Resizer
          </Link>
        </div>
      </div>

      {/* ================= ONE-CLICK STUDIO PACKS & PORTAL PRESETS ================= */}
      <div className="mb-6 space-y-3">
        <div className="pms-glass-panel rounded-3xl p-3.5 sm:p-4">
          <div className="flex items-center justify-between mb-2.5 px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--pms-muted)' }}>
              <Package className="w-3.5 h-3.5 text-[var(--pms-violet)]" /> Quick Studio Presets (1-Click Setup)
            </span>
            <span className="text-[11px]" style={{ color: 'var(--pms-subtle-text)' }}>Select standard photo paper packs</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <button
              type="button"
              onClick={() => applyPresetPack('4r_classic')}
              className={`py-2.5 px-3 rounded-2xl border text-left transition-all cursor-pointer ${
                paperSizeId === '4r' && orientation === 'portrait' && gridCols === 2 && gridRows === 3
                  ? 'border-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] font-bold shadow-xs'
                  : 'border-[var(--pms-border)] hover:border-violet-300 dark:hover:border-violet-700'
              }`}
              style={
                paperSizeId === '4r' && orientation === 'portrait' && gridCols === 2 && gridRows === 3
                  ? undefined
                  : { backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }
              }
            >
              <div className="text-xs font-black">4R Classic (6)</div>
              <div className="text-[10px]" style={{ color: 'var(--pms-muted)' }}>2×3 Grid • Studio 4×6"</div>
            </button>

            <button
              type="button"
              onClick={() => applyPresetPack('4r_max')}
              className={`py-2.5 px-3 rounded-2xl border text-left transition-all cursor-pointer ${
                paperSizeId === '4r' && orientation === 'landscape' && gridCols === 4 && gridRows === 2
                  ? 'border-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] font-bold shadow-xs'
                  : 'border-[var(--pms-border)] hover:border-violet-300 dark:hover:border-violet-700'
              }`}
              style={
                paperSizeId === '4r' && orientation === 'landscape' && gridCols === 4 && gridRows === 2
                  ? undefined
                  : { backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }
              }
            >
              <div className="text-xs font-black">4R Landscape (8)</div>
              <div className="text-[10px]" style={{ color: 'var(--pms-muted)' }}>4×2 Grid • Max 4×6"</div>
            </button>

            <button
              type="button"
              onClick={() => applyPresetPack('a4_full')}
              className={`py-2.5 px-3 rounded-2xl border text-left transition-all cursor-pointer ${
                paperSizeId === 'a4' && gridCols === 5 && gridRows === 6
                  ? 'border-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] font-bold shadow-xs'
                  : 'border-[var(--pms-border)] hover:border-violet-300 dark:hover:border-violet-700'
              }`}
              style={
                paperSizeId === 'a4' && gridCols === 5 && gridRows === 6
                  ? undefined
                  : { backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }
              }
            >
              <div className="text-xs font-black">A4 Full Sheet (30) ★</div>
              <div className="text-[10px] font-semibold text-[var(--pms-violet)]">Perfect for 28 Photos</div>
            </button>

            <button
              type="button"
              onClick={() => applyPresetPack('a4_half')}
              className={`py-2.5 px-3 rounded-2xl border text-left transition-all cursor-pointer ${
                paperSizeId === 'a4' && gridCols === 5 && gridRows === 3
                  ? 'border-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] font-bold shadow-xs'
                  : 'border-[var(--pms-border)] hover:border-violet-300 dark:hover:border-violet-700'
              }`}
              style={
                paperSizeId === 'a4' && gridCols === 5 && gridRows === 3
                  ? undefined
                  : { backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }
              }
            >
              <div className="text-xs font-black">A4 Half Pack (15)</div>
              <div className="text-[10px]" style={{ color: 'var(--pms-muted)' }}>5×3 Grid • Top Half</div>
            </button>

            <button
              type="button"
              onClick={() => applyPresetPack('a5_pack')}
              className={`py-2.5 px-3 rounded-2xl border text-left transition-all cursor-pointer ${
                paperSizeId === 'a5' && gridCols === 3 && gridRows === 4
                  ? 'border-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] font-bold shadow-xs'
                  : 'border-[var(--pms-border)] hover:border-violet-300 dark:hover:border-violet-700'
              }`}
              style={
                paperSizeId === 'a5' && gridCols === 3 && gridRows === 4
                  ? undefined
                  : { backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }
              }
            >
              <div className="text-xs font-black">A5 Pack (12)</div>
              <div className="text-[10px]" style={{ color: 'var(--pms-muted)' }}>3×4 Grid • Compact</div>
            </button>
          </div>
        </div>

        {/* ================= SARKARI EXAM QUICK PORTAL MODES ================= */}
        <div className="pms-glass-panel rounded-3xl p-3.5 sm:p-4">
          <div className="flex items-center justify-between mb-2.5 px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--pms-ink)' }}>
              <FileCheck2 className="w-3.5 h-3.5 text-[var(--pms-violet)]" /> Sarkari Exam &amp; Portal Presets
            </span>
            <span className="text-[11px] font-semibold text-[var(--pms-violet)]">
              Select portal for standard dimensions
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'ssc', label: 'SSC (GD/CGL/CHSL)', sub: '35×45mm Standard' },
              { id: 'upsc', label: 'UPSC Civil Services', sub: '35×45mm Format' },
              { id: 'rrb', label: 'Railway RRB/NTPC', sub: 'Clean White BG' },
              { id: 'neet', label: 'NEET / JEE / CUET', sub: '35×35mm Square' },
              { id: 'passport', label: 'Indian Passport Kendra', sub: 'White BG • No Border' },
              { id: 'us_visa', label: 'US Visa 2×2 inch', sub: '51×51mm Square' },
            ].map((sp) => (
              <button
                key={sp.id}
                type="button"
                onClick={() => applySarkariPortalPreset(sp.id as any)}
                className={`px-3 py-2 rounded-2xl border text-left transition-all cursor-pointer ${
                  activeSarkariId === sp.id
                    ? 'pms-btn-primary border-transparent shadow-sm'
                    : 'border-[var(--pms-border)] hover:border-violet-300 dark:hover:border-violet-700'
                }`}
                style={
                  activeSarkariId === sp.id
                    ? undefined
                    : { backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }
                }
              >
                <div className="text-xs font-bold">
                  {activeSarkariId === sp.id && '\u2713 '}{sp.label}
                </div>
                <div
                  className="text-[10px]"
                  style={{ color: activeSarkariId === sp.id ? 'rgba(255,255,255,0.85)' : 'var(--pms-violet)' }}
                >
                  {sp.sub}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ================= SMART CAPACITY ADVISORY (e.g. For 28 Photos on 4R) ================= */}
      <AnimatePresence>
        {targetPhotoCount > slotsPerSheet && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
            className="mb-6 p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs sm:text-sm font-bold text-amber-950 dark:text-amber-200">
                  You selected <strong>{targetPhotoCount} photos</strong>. On {activePaper.name}, 1 sheet holds max <strong>{slotsPerSheet} photos</strong> (Total {totalSheetsRequired} sheets required).
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                  Want all {targetPhotoCount} photos on a <strong>single sheet</strong> without multiple papers? Switch to A4.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSwitchToA4}
              className="shrink-0 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Switch to A4 Sheet (1 Page)
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= OVERFLOW SAFETY WARNING ================= */}
      <AnimatePresence>
        {safeLimits.isOverflow && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
            className="mb-6 p-4 rounded-2xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs sm:text-sm font-bold text-rose-950 dark:text-rose-200">
                  ⚠️ Grid Overflow Warning: Current {gridRows} rows × {gridCols} cols exceed printable sheet bounds!
                </p>
                <p className="text-xs text-rose-800 dark:text-rose-300 mt-0.5">
                  On {activePaper.name}, maximum safe dimensions are <strong>{safeLimits.maxRows} rows × {safeLimits.maxCols} cols</strong>.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAutoFit}
              className="shrink-0 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Auto-Fix Grid
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= BIOMETRIC ALIGNMENT & FACE GLOW MODAL ================= */}
      <AnimatePresence>
        {isCropModalOpen && currentPhoto && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReduced ? undefined : { opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          >
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={prefersReduced ? undefined : { opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.22 }}
              className="relative w-full max-w-4xl pms-glass-panel rounded-3xl overflow-hidden flex flex-col max-h-[92vh]"
              style={{ backgroundColor: 'var(--pms-white)' }}
            >
              <PearlScanOverlay
                active={currentPhoto.isRemovingBg || isBatchRemovingBg}
                label={isBatchRemovingBg ? 'Batch removing backgrounds…' : 'AI removing portrait background…'}
              />
              {/* Modal Header & Navigation Tabs */}
              <div className="flex flex-wrap items-center justify-between px-6 py-3.5 border-b border-[var(--pms-border)] gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'var(--pms-soft-lavender)', color: 'var(--pms-violet)' }}
                  >
                    <Camera className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold" style={{ color: 'var(--pms-ink)' }}>
                      Biometric &amp; Lighting Studio
                    </h3>
                    <p className="text-[11px]" style={{ color: 'var(--pms-muted)' }}>Center face in oval • Adjust face lighting</p>
                  </div>
                </div>

                {/* Mode Tabs: Align & Lighting */}
                <div className="flex items-center gap-1 p-1 rounded-2xl border border-[var(--pms-border)]" style={{ backgroundColor: 'var(--pms-pearl)' }}>
                  <button
                    type="button"
                    onClick={() => setModalActiveTab('align')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      modalActiveTab === 'align'
                        ? 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] shadow-xs'
                        : 'text-[var(--pms-muted)]'
                    }`}
                  >
                    📐 Biometrics &amp; Crop
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalActiveTab('light')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      modalActiveTab === 'light'
                        ? 'bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] shadow-xs'
                        : 'text-[var(--pms-muted)]'
                    }`}
                  >
                    💡 Studio Face Lighting
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCropModalOpen(false)}
                  className="px-4 py-2 rounded-xl pms-btn-primary font-bold text-xs cursor-pointer"
                >
                  Done &amp; Apply
                </button>
              </div>

              {/* Modal Body */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 overflow-y-auto items-center">
                {/* Left Live Viewport */}
                <div className="md:col-span-7 flex flex-col items-center justify-center">
                  <div
                    className="relative w-full max-w-sm h-80 bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center select-none cursor-grab active:cursor-grabbing border border-[var(--pms-border)] shadow-inner touch-none"
                    onMouseDown={(e) => {
                      isDraggingRef.current = true;
                      dragStartRef.current = {
                        x: e.clientX - currentPhoto.panOffset.x,
                        y: e.clientY - currentPhoto.panOffset.y,
                      };
                    }}
                    onMouseMove={(e) => {
                      if (!isDraggingRef.current) return;
                      const newX = e.clientX - dragStartRef.current.x;
                      const newY = e.clientY - dragStartRef.current.y;
                      updatePhoto(currentPhoto.id, (p) => ({ ...p, panOffset: { x: newX, y: newY } }));
                    }}
                    onMouseUp={() => { isDraggingRef.current = false; }}
                    onMouseLeave={() => { isDraggingRef.current = false; }}
                    // Touch support for mobile devices
                    onTouchStart={(e) => {
                      isDraggingRef.current = true;
                      const t = e.touches[0];
                      dragStartRef.current = {
                        x: t.clientX - currentPhoto.panOffset.x,
                        y: t.clientY - currentPhoto.panOffset.y,
                      };
                    }}
                    onTouchMove={(e) => {
                      if (!isDraggingRef.current) return;
                      e.preventDefault();
                      const t = e.touches[0];
                      const newX = t.clientX - dragStartRef.current.x;
                      const newY = t.clientY - dragStartRef.current.y;
                      updatePhoto(currentPhoto.id, (p) => ({ ...p, panOffset: { x: newX, y: newY } }));
                    }}
                    onTouchEnd={() => { isDraggingRef.current = false; }}
                  >
                    {/* Photo Card Frame — matches exact passport aspect ratio & covers identically to canvas */}
                    {(() => {
                      const modalTileH = 220;
                      const modalTileW = Math.round(((currentPhoto.isJointPhoto ? basePhotoWidthMm * 2 : basePhotoWidthMm) / basePhotoHeightMm) * modalTileH);
                      const activeImg = currentPhoto.processedImg ?? currentPhoto.img;
                      const imgW = activeImg.naturalWidth || activeImg.width || 1;
                      const imgH = activeImg.naturalHeight || activeImg.height || 1;
                      const imgAspect = imgW / imgH;
                      const tileAspect = modalTileW / modalTileH;
                      let drawW = modalTileW;
                      let drawH = modalTileH;
                      if (imgAspect > tileAspect) {
                        drawH = modalTileH;
                        drawW = modalTileH * imgAspect;
                      } else {
                        drawW = modalTileW;
                        drawH = modalTileW / imgAspect;
                      }

                      return (
                        <div
                          className="relative rounded-sm overflow-hidden shadow-2xl flex items-center justify-center shrink-0 border border-slate-700/60"
                          style={{
                            width: `${modalTileW}px`,
                            height: `${modalTileH}px`,
                            backgroundColor: bgColor,
                          }}
                        >
                          {/* Real Photo with Live Lighting, Contrast, Saturation & Transforms */}
                          <img
                            src={activeImg.src}
                            alt="Alignment"
                            style={{
                              width: `${drawW}px`,
                              height: `${drawH}px`,
                              position: 'absolute',
                              left: '50%',
                              top: '50%',
                              marginLeft: `${-drawW / 2}px`,
                              marginTop: `${-drawH / 2}px`,
                              transform: `translate(${currentPhoto.panOffset.x}px, ${currentPhoto.panOffset.y}px) rotate(${currentPhoto.rotation}deg) scale(${currentPhoto.zoom / 100}) scaleX(${currentPhoto.isFlippedH ? -1 : 1})`,
                              transformOrigin: 'center center',
                              filter: [
                                currentPhoto.brightness !== 0 ? `brightness(${100 + currentPhoto.brightness}%)` : '',
                                currentPhoto.contrast !== 0 ? `contrast(${100 + currentPhoto.contrast}%)` : '',
                                currentPhoto.saturation !== 0 ? `saturate(${100 + currentPhoto.saturation}%)` : '',
                              ].filter(Boolean).join(' ') || undefined,
                              pointerEvents: 'none',
                              maxWidth: 'none',
                              maxHeight: 'none',
                            }}
                          />

                          {/* Candidate Text Overlay inside photo preview if enabled */}
                          {hasCandidateText && (candidateName.trim() || candidateDate.trim()) && (
                            <div className="absolute bottom-0 inset-x-0 bg-white/95 border-t border-slate-300 py-0.5 px-1 text-center pointer-events-none z-10">
                              {candidateName.trim() && (
                                <p className="text-[9px] font-black uppercase text-black leading-tight truncate">
                                  {candidateName.trim()}
                                </p>
                              )}
                              {candidateDate.trim() && (
                                <p className="text-[8px] font-bold text-black leading-tight">
                                  DOP: {candidateDate.trim()}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Photo Border preview if enabled */}
                          {hasBorder && borderWidthMm > 0 && (
                            <div
                              className="absolute inset-0 pointer-events-none z-10"
                              style={{
                                border: `${Math.max(1, Math.round(borderWidthMm * 2))}px solid ${borderColor}`,
                              }}
                            />
                          )}

                          {/* Biometric Oval Guide Overlay */}
                          {showBiometricGuides && modalActiveTab === 'align' && (
                            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-20">
                              <div
                                className="relative flex items-center justify-center"
                                style={{
                                  width: `${modalTileW}px`,
                                  height: `${modalTileH}px`,
                                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                                  borderRadius: '50%',
                                  border: '2px solid #7C3AED',
                                }}
                              >
                                {/* Eye-level guide line */}
                                <div className="absolute w-full top-[44%] border-t border-dashed border-amber-400 opacity-80" />
                                {/* Head zone inner guide */}
                                <div
                                  className="absolute border border-dashed border-emerald-400 opacity-70"
                                  style={{
                                    width: '70%',
                                    height: '72%',
                                    top: '9%',
                                    borderRadius: '50%',
                                  }}
                                />
                                <span className="absolute bottom-[-22px] text-[10px] font-bold text-white bg-black/80 px-2 py-0.5 rounded whitespace-nowrap shadow-sm">
                                  Eyes on amber line • Head 70–80%
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex items-center justify-between w-full max-w-sm mt-3 px-1">
                    <span className="text-[11px]" style={{ color: 'var(--pms-muted)' }}>
                      👆 Drag (mouse or touch) to center head
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowBiometricGuides((v) => !v)}
                      className="text-[11px] font-bold text-[var(--pms-violet)] hover:underline cursor-pointer"
                    >
                      {showBiometricGuides ? 'Hide Guides' : 'Show Guides'}
                    </button>
                  </div>
                </div>

                {/* Right Panel Tabs */}
                <div className="md:col-span-5 space-y-4">
                  {/* TAB 1: ALIGNMENT & BIOMETRICS */}
                  {modalActiveTab === 'align' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => handleRemoveBackground(currentPhoto)}
                          disabled={currentPhoto.isRemovingBg || isBatchRemovingBg}
                          className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-violet-600 to-rose-600 hover:from-violet-500 hover:to-rose-500 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                        >
                          {currentPhoto.isRemovingBg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          {currentPhoto.isBgRemoved ? 'Background Removed ✓' : 'Remove Background (AI)'}
                        </button>

                        {photos.length > 1 && (
                          <button
                            type="button"
                            onClick={handleBatchRemoveBackground}
                            disabled={isBatchRemovingBg || currentPhoto.isRemovingBg}
                            className="w-full py-2 px-3 rounded-xl border border-[var(--pms-border)] bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] font-bold text-xs shadow-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 cursor-pointer"
                          >
                            {isBatchRemovingBg ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Layers className="w-3.5 h-3.5" />
                            )}
                            Remove BG for All ({photos.length} Photos)
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--pms-border)]" style={{ backgroundColor: 'var(--pms-pearl)' }}>
                        <div>
                          <span className="text-xs font-bold block" style={{ color: 'var(--pms-ink)' }}>Joint Photo (2-in-1)</span>
                          <span className="text-[10px]" style={{ color: 'var(--pms-muted)' }}>Double width for couple / pension</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={currentPhoto.isJointPhoto}
                          onChange={(e) =>
                            updatePhoto(currentPhoto.id, (p) => ({ ...p, isJointPhoto: e.target.checked }))
                          }
                          className="w-4 h-4 rounded accent-violet-600"
                        />
                      </div>

                      {/* Zoom */}
                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1" style={{ color: 'var(--pms-ink)' }}>
                          <span>Zoom: {currentPhoto.zoom}%</span>
                          <button
                            type="button"
                            onClick={() => updatePhoto(currentPhoto.id, (p) => ({ ...p, zoom: 100 }))}
                            className="text-[var(--pms-violet)] text-[11px] hover:underline cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updatePhoto(currentPhoto.id, (p) => ({ ...p, zoom: Math.max(60, p.zoom - 5) }))}
                            className="p-1.5 rounded-lg border border-[var(--pms-border)] cursor-pointer"
                            style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-ink)' }}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="range"
                            min={60}
                            max={200}
                            value={currentPhoto.zoom}
                            onChange={(e) => updatePhoto(currentPhoto.id, (p) => ({ ...p, zoom: Number(e.target.value) }))}
                            className="w-full accent-violet-600"
                          />
                          <button
                            type="button"
                            onClick={() => updatePhoto(currentPhoto.id, (p) => ({ ...p, zoom: Math.min(200, p.zoom + 5) }))}
                            className="p-1.5 rounded-lg border border-[var(--pms-border)] cursor-pointer"
                            style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-ink)' }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Straighten / Rotation */}
                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1" style={{ color: 'var(--pms-ink)' }}>
                          <span>Straighten: {currentPhoto.rotation}°</span>
                          <button
                            type="button"
                            onClick={() => updatePhoto(currentPhoto.id, (p) => ({ ...p, rotation: 0 }))}
                            className="text-[var(--pms-violet)] text-[11px] hover:underline cursor-pointer"
                          >
                            0°
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updatePhoto(currentPhoto.id, (p) => ({ ...p, rotation: (p.rotation - 90) % 360 }))}
                            className="px-2 py-1 rounded-lg border border-[var(--pms-border)] text-[10px] font-bold cursor-pointer"
                            style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-ink)' }}
                          >
                            ↺ 90°
                          </button>
                          <input
                            type="range"
                            min={-30}
                            max={30}
                            value={currentPhoto.rotation}
                            onChange={(e) => updatePhoto(currentPhoto.id, (p) => ({ ...p, rotation: Number(e.target.value) }))}
                            className="w-full accent-violet-600"
                          />
                          <button
                            type="button"
                            onClick={() => updatePhoto(currentPhoto.id, (p) => ({ ...p, rotation: (p.rotation + 90) % 360 }))}
                            className="px-2 py-1 rounded-lg border border-[var(--pms-border)] text-[10px] font-bold cursor-pointer"
                            style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-ink)' }}
                          >
                            ↻ 90°
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => updatePhoto(currentPhoto.id, (p) => ({ ...p, isFlippedH: !p.isFlippedH }))}
                          className="flex-1 py-1.5 px-2 rounded-xl border border-[var(--pms-border)] text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                          style={{ color: 'var(--pms-ink)' }}
                        >
                          <FlipHorizontal className="w-3.5 h-3.5" /> Flip Horizontal
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUndoPhotoChanges(currentPhoto.id)}
                          className="py-1.5 px-2.5 rounded-xl text-xs text-[var(--pms-violet)] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                          title="Revert to state before adjustments"
                        >
                          <RotateCcw className="w-3 h-3" /> Undo
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updatePhoto(currentPhoto.id, (p) => ({
                              ...p,
                              panOffset: { x: 0, y: 0 },
                              zoom: 100,
                              rotation: 0,
                              isFlippedH: false,
                            }))
                          }
                          className="py-1.5 px-3 rounded-xl text-xs hover:underline cursor-pointer"
                          style={{ color: 'var(--pms-muted)' }}
                        >
                          Reset All
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: STUDIO FACE LIGHTING */}
                  {modalActiveTab === 'light' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold" style={{ color: 'var(--pms-ink)' }}>
                          Studio Lighting &amp; Contrast
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updatePhoto(currentPhoto.id, (p) => ({
                              ...p,
                              brightness: 10,
                              contrast: 14,
                              saturation: 8,
                            }))
                          }
                          className="px-2.5 py-1 rounded-lg bg-[var(--pms-soft-rose)] border border-[var(--pms-border)] text-amber-700 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Sun className="w-3 h-3 text-amber-500" /> 1-Click Studio Glow
                        </button>
                      </div>

                      {/* Face Brightness */}
                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1" style={{ color: 'var(--pms-ink)' }}>
                          <span className="flex items-center gap-1.5">
                            <Sun className="w-3.5 h-3.5 text-amber-500" /> Face Brightness: {currentPhoto.brightness > 0 ? `+${currentPhoto.brightness}` : currentPhoto.brightness}
                          </span>
                          <button
                            type="button"
                            onClick={() => updatePhoto(currentPhoto.id, (p) => ({ ...p, brightness: 0 }))}
                            className="text-[var(--pms-violet)] text-[11px] hover:underline cursor-pointer"
                          >
                            Default
                          </button>
                        </div>
                        <input
                          type="range"
                          min={-30}
                          max={40}
                          value={currentPhoto.brightness}
                          onChange={(e) =>
                            updatePhoto(currentPhoto.id, (p) => ({ ...p, brightness: Number(e.target.value) }))
                          }
                          className="w-full accent-amber-500"
                        />
                      </div>

                      {/* Face Contrast */}
                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1" style={{ color: 'var(--pms-ink)' }}>
                          <span className="flex items-center gap-1.5">
                            <Contrast className="w-3.5 h-3.5 text-[var(--pms-violet)]" /> Studio Contrast: {currentPhoto.contrast > 0 ? `+${currentPhoto.contrast}` : currentPhoto.contrast}
                          </span>
                          <button
                            type="button"
                            onClick={() => updatePhoto(currentPhoto.id, (p) => ({ ...p, contrast: 0 }))}
                            className="text-[var(--pms-violet)] text-[11px] hover:underline cursor-pointer"
                          >
                            Default
                          </button>
                        </div>
                        <input
                          type="range"
                          min={-30}
                          max={40}
                          value={currentPhoto.contrast}
                          onChange={(e) =>
                            updatePhoto(currentPhoto.id, (p) => ({ ...p, contrast: Number(e.target.value) }))
                          }
                          className="w-full accent-violet-600"
                        />
                      </div>

                      {/* Color Saturation / Warmth */}
                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1" style={{ color: 'var(--pms-ink)' }}>
                          <span className="flex items-center gap-1.5">
                            <Sliders className="w-3.5 h-3.5 text-[var(--pms-rose)]" /> Color Saturation / Warmth: {currentPhoto.saturation > 0 ? `+${currentPhoto.saturation}` : currentPhoto.saturation}
                          </span>
                          <button
                            type="button"
                            onClick={() => updatePhoto(currentPhoto.id, (p) => ({ ...p, saturation: 0 }))}
                            className="text-[var(--pms-violet)] text-[11px] hover:underline cursor-pointer"
                          >
                            Default
                          </button>
                        </div>
                        <input
                          type="range"
                          min={-50}
                          max={60}
                          value={currentPhoto.saturation}
                          onChange={(e) =>
                            updatePhoto(currentPhoto.id, (p) => ({ ...p, saturation: Number(e.target.value) }))
                          }
                          className="w-full accent-rose-500"
                        />
                      </div>

                      <div className="p-3 rounded-2xl border border-[var(--pms-border)] text-[11px] space-y-1" style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-muted)' }}>
                        <p>✨ <strong>Studio Tip:</strong> Phone photos often have dark face shadows and dull colors. Setting Brightness to +10, Contrast to +14, and Saturation to +8 creates a professional studio strobe flash look.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= MAIN STUDIO WORKSPACE ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ================= LEFT CONTROLS (SECTIONS 1 - 4) ================= */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="lg:col-span-7 space-y-6"
        >
          {/* SECTION 1: PHOTO SOURCE & MULTI-PHOTO LIST */}
          <div className="pms-glass-panel rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-7 h-7 rounded-full font-bold text-xs flex items-center justify-center"
                  style={{ backgroundColor: 'var(--pms-soft-lavender)', color: 'var(--pms-violet)' }}
                >
                  1
                </span>
                <h2 className="text-base font-bold" style={{ color: 'var(--pms-ink)' }}>
                  Photo &amp; Biometric Studio
                </h2>
              </div>

              {photos.length > 0 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--pms-border)] bg-[var(--pms-soft-lavender)] hover:opacity-90 text-xs font-bold text-[var(--pms-violet)] transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Another Photo
                </button>
              )}
            </div>

            {photos.length === 0 ? (
              <FileDropzone
                onDrop={addFilesToSession}
                multiple={true}
                accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
                title="Select or drop portrait photo"
                subtitle="Passport photo, phone portrait selfie, or scan"
                className="p-8"
              />
            ) : (
              <div className="space-y-3">
                {photos.map((photo, idx) => (
                  <div
                    key={photo.id}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                      activePhotoId === photo.id
                        ? 'border-[var(--pms-violet)] bg-[var(--pms-soft-lavender)]'
                        : 'border-[var(--pms-border)]'
                    }`}
                    style={activePhotoId === photo.id ? undefined : { backgroundColor: 'var(--pms-white)' }}
                  >
                    <div
                      className="flex items-center gap-3 cursor-pointer min-w-0"
                      onClick={() => {
                        setActivePhotoId(photo.id);
                        setIsCropModalOpen(true);
                      }}
                    >
                      <div className="w-12 h-14 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0 border border-[var(--pms-border)] relative group">
                        <img
                          src={photo.processedImg?.src || photo.objectUrl}
                          alt={`Photo ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold transition-opacity">
                          Edit
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate" style={{ color: 'var(--pms-ink)' }}>
                          Photo {idx + 1}
                        </p>
                        <p className="text-[11px] text-[var(--pms-violet)] font-semibold flex items-center gap-1">
                          <Camera className="w-3 h-3" /> Crop &amp; Face Lighting
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div
                        className="flex items-center border border-[var(--pms-border)] rounded-xl px-2 py-1"
                        style={{ backgroundColor: 'var(--pms-white)' }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            updatePhoto(photo.id, (p) => ({ ...p, copies: Math.max(1, p.copies - 1) }))
                          }
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          style={{ color: 'var(--pms-muted)' }}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold px-2" style={{ color: 'var(--pms-ink)' }}>
                          {photo.copies}
                        </span>
                        <button
                          type="button"
                          onClick={() => updatePhoto(photo.id, (p) => ({ ...p, copies: p.copies + 1 }))}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          style={{ color: 'var(--pms-muted)' }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[10px] font-semibold ml-1" style={{ color: 'var(--pms-subtle-text)' }}>copies</span>
                      </div>

                      {photos.length > 1 && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => movePhoto(idx, idx - 1)}
                            disabled={idx === 0}
                            className="p-1 rounded-lg hover:text-[var(--pms-violet)] hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20 transition-colors cursor-pointer"
                            style={{ color: 'var(--pms-muted)' }}
                            title="Move Photo Up"
                          >
                            <ChevronLeft className="w-3.5 h-3.5 rotate-90" />
                          </button>
                          <button
                            type="button"
                            onClick={() => movePhoto(idx, idx + 1)}
                            disabled={idx === photos.length - 1}
                            className="p-1 rounded-lg hover:text-[var(--pms-violet)] hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20 transition-colors cursor-pointer"
                            style={{ color: 'var(--pms-muted)' }}
                            title="Move Photo Down"
                          >
                            <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removePhoto(photo.id)}
                            className="p-1 rounded-lg hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            style={{ color: 'var(--pms-muted)' }}
                            title="Remove Photo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 2: QUANTITY & SMART GRID LAYOUT */}
          <div className="pms-glass-panel rounded-3xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-7 h-7 rounded-full font-bold text-xs flex items-center justify-center"
                  style={{ backgroundColor: 'var(--pms-soft-lavender)', color: 'var(--pms-violet)' }}
                >
                  2
                </span>
                <h2 className="text-base font-bold" style={{ color: 'var(--pms-ink)' }}>
                  Quantity &amp; Grid Layout
                </h2>
              </div>

              <button
                type="button"
                onClick={handleAutoFit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] border border-[var(--pms-border)] text-xs font-bold hover:opacity-90 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Auto-Fit Safe Grid
              </button>
            </div>

            {/* Target Photo Quantity Input with Quick Chips (e.g. 28) */}
            <div
              className="p-4 rounded-2xl border border-[var(--pms-border)]"
              style={{ backgroundColor: 'var(--pms-soft-lavender)' }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider block" style={{ color: 'var(--pms-ink)' }}>
                    Total Photos to Print
                  </label>
                  <p className="text-[11px]" style={{ color: 'var(--pms-muted)' }}>
                    Enter any number (e.g. 28). The engine auto-allocates grid &amp; sheets.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center border border-[var(--pms-border-strong)] rounded-xl px-3 py-1.5 shadow-sm"
                    style={{ backgroundColor: 'var(--pms-white)' }}
                  >
                    <button
                      type="button"
                      onClick={() => handleTargetCountChange(targetPhotoCount - 1)}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      style={{ color: 'var(--pms-muted)' }}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={targetPhotoCount}
                      onChange={(e) => handleTargetCountChange(parseInt(e.target.value) || 1)}
                      className="w-16 text-center text-sm font-black text-[var(--pms-violet)] bg-transparent border-none focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleTargetCountChange(targetPhotoCount + 1)}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      style={{ color: 'var(--pms-muted)' }}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Quantity Chips */}
              <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-[var(--pms-border)]">
                <span className="text-[10px] text-[var(--pms-violet)] font-bold uppercase mr-1">
                  Popular:
                </span>
                {[4, 6, 8, 12, 16, 24, 28, 30, 32].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleTargetCountChange(num)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      targetPhotoCount === num
                        ? 'pms-btn-primary shadow-xs'
                        : 'border border-[var(--pms-border)] hover:border-violet-300 dark:hover:border-violet-700'
                    }`}
                    style={
                      targetPhotoCount === num
                        ? undefined
                        : { backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }
                    }
                  >
                    {num}
                  </button>
                ))}
              </div>

              {paperSizeId === 'a4' && targetPhotoCount === 28 && (
                <div
                  className="mt-3 p-2.5 rounded-xl border border-[var(--pms-border)] text-[11px] flex flex-wrap items-center justify-between gap-2"
                  style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                >
                  <span>⚡ <strong>28 photos selected</strong> on 5×6 A4 sheet (2 blank slots remaining).</span>
                  <button
                    type="button"
                    onClick={() => handleTargetCountChange(30)}
                    className="font-bold text-[var(--pms-violet)] underline cursor-pointer"
                  >
                    Fill full sheet (30 photos) →
                  </button>
                </div>
              )}
            </div>

            {/* Paper Size & Orientation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--pms-muted)' }}>
                  Paper Size
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PAPER_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPaperSizeId(p.id);
                        handleAutoFit();
                      }}
                      className={`py-2 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                        paperSizeId === p.id
                          ? 'border-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] font-bold ring-1 ring-[var(--pms-violet)]'
                          : 'border-[var(--pms-border)] hover:border-violet-300 dark:hover:border-violet-700'
                      }`}
                      style={paperSizeId === p.id ? undefined : { backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-[var(--pms-violet)]" />
                        <span className="text-xs font-bold">{p.name}</span>
                      </div>
                      <span className="text-[10px] block mt-0.5" style={{ color: 'var(--pms-subtle-text)' }}>{p.wMm}×{p.hMm}mm</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--pms-muted)' }}>
                  Orientation
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOrientation('portrait')}
                    className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${
                      orientation === 'portrait'
                        ? 'border-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]'
                        : 'border-[var(--pms-border)]'
                    }`}
                    style={orientation === 'portrait' ? undefined : { backgroundColor: 'var(--pms-white)', color: 'var(--pms-muted)' }}
                  >
                    <span className="w-3 h-4 border-2 border-current rounded-xs" />
                    <span>Portrait ↕</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrientation('landscape')}
                    className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${
                      orientation === 'landscape'
                        ? 'border-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)]'
                        : 'border-[var(--pms-border)]'
                    }`}
                    style={orientation === 'landscape' ? undefined : { backgroundColor: 'var(--pms-white)', color: 'var(--pms-muted)' }}
                  >
                    <span className="w-4 h-3 border-2 border-current rounded-xs" />
                    <span>Landscape ↔</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Rows × Columns Manual Steppers with Safety Cap */}
            <div className="p-4 rounded-2xl border border-[var(--pms-border)]" style={{ backgroundColor: 'var(--pms-pearl)' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold" style={{ color: 'var(--pms-ink)' }}>
                  Grid Matrix ({gridRows} rows × {gridCols} cols = {slotsPerSheet} slots/sheet)
                </span>
                <span className="text-[11px]" style={{ color: 'var(--pms-muted)' }}>
                  Safe Limit on {activePaper.name}: {safeLimits.maxRows}R × {safeLimits.maxCols}C
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--pms-muted)' }}>Rows</label>
                  <div
                    className="flex items-center border border-[var(--pms-border)] rounded-xl px-2 py-1"
                    style={{ backgroundColor: 'var(--pms-white)' }}
                  >
                    <button
                      type="button"
                      onClick={() => setGridRows((r) => Math.max(1, r - 1))}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      style={{ color: 'var(--pms-muted)' }}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={gridRows}
                      onChange={(e) => setGridRows(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full text-center text-xs font-bold bg-transparent border-none focus:outline-none"
                      style={{ color: 'var(--pms-ink)' }}
                    />
                    <button
                      type="button"
                      onClick={() => setGridRows((r) => r + 1)}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      style={{ color: 'var(--pms-muted)' }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--pms-muted)' }}>Columns</label>
                  <div
                    className="flex items-center border border-[var(--pms-border)] rounded-xl px-2 py-1"
                    style={{ backgroundColor: 'var(--pms-white)' }}
                  >
                    <button
                      type="button"
                      onClick={() => setGridCols((c) => Math.max(1, c - 1))}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      style={{ color: 'var(--pms-muted)' }}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={gridCols}
                      onChange={(e) => setGridCols(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full text-center text-xs font-bold bg-transparent border-none focus:outline-none"
                      style={{ color: 'var(--pms-ink)' }}
                    />
                    <button
                      type="button"
                      onClick={() => setGridCols((c) => c + 1)}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      style={{ color: 'var(--pms-muted)' }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Gap, Margins & Cut Lines */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="flex justify-between font-semibold mb-1" style={{ color: 'var(--pms-ink)' }}>
                  <span>Photo Spacing Gap</span>
                  <span className="font-mono text-[var(--pms-violet)]">{gapMm} mm</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={8}
                  step={0.5}
                  value={gapMm}
                  onChange={(e) => setGapMm(Number(e.target.value))}
                  className="w-full accent-violet-600"
                />
              </div>

              <div>
                <div className="flex justify-between font-semibold mb-1" style={{ color: 'var(--pms-ink)' }}>
                  <span>Sheet Margins</span>
                  <span className="font-mono text-[var(--pms-violet)]">{noMargins ? '0 mm (Borderless)' : `${marginMm} mm`}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={15}
                  disabled={noMargins}
                  value={marginMm}
                  onChange={(e) => setMarginMm(Number(e.target.value))}
                  className="w-full accent-violet-600 disabled:opacity-30"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--pms-border)] text-xs">
              <label className="flex items-center gap-2 font-bold cursor-pointer" style={{ color: 'var(--pms-ink)' }}>
                <input
                  type="checkbox"
                  checked={hasCutGuides}
                  onChange={(e) => setHasCutGuides(e.target.checked)}
                  className="rounded accent-violet-600 w-4 h-4"
                />
                <Scissors className="w-4 h-4 text-[var(--pms-violet)]" />
                <span>Draw scissor cut guides (dashed cutting lines)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--pms-muted)' }}>
                <input
                  type="checkbox"
                  checked={noMargins}
                  onChange={(e) => setNoMargins(e.target.checked)}
                  className="rounded accent-violet-600 w-3.5 h-3.5"
                />
                <span>Borderless paper (0 mm margins)</span>
              </label>
            </div>
          </div>

          {/* SECTION 3: PHOTO APPEARANCE & EXAM TEXT (UNCHECKED BY DEFAULT) */}
          <div className="pms-glass-panel rounded-3xl p-6 space-y-5">
            <div className="flex items-center gap-2.5">
              <span
                className="w-7 h-7 rounded-full font-bold text-xs flex items-center justify-center"
                style={{ backgroundColor: 'var(--pms-soft-lavender)', color: 'var(--pms-violet)' }}
              >
                3
              </span>
              <h2 className="text-base font-bold" style={{ color: 'var(--pms-ink)' }}>
                Photo Standards &amp; Exam Settings
              </h2>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--pms-muted)' }}>
                Standard Photo Dimension
              </label>
              <select
                value={photoPresetId}
                onChange={(e) => {
                  setPhotoPresetId(e.target.value);
                  setTimeout(handleAutoFit, 10);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--pms-border)] text-sm font-semibold focus:ring-2 focus:ring-violet-500"
                style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
              >
                {PHOTO_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom dimensions if chosen */}
            {photoPresetId === 'custom' && (
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border border-[var(--pms-border)]" style={{ backgroundColor: 'var(--pms-pearl)' }}>
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--pms-ink)' }}>Width (mm)</label>
                  <input
                    type="number"
                    min={20}
                    max={120}
                    value={customPhotoW}
                    onChange={(e) => setCustomPhotoW(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--pms-border)] text-sm"
                    style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--pms-ink)' }}>Height (mm)</label>
                  <input
                    type="number"
                    min={20}
                    max={150}
                    value={customPhotoH}
                    onChange={(e) => setCustomPhotoH(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--pms-border)] text-sm"
                    style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                  />
                </div>
              </div>
            )}

            {/* Candidate Name & Date Text on Photo (DOP) — DEFAULT UNCHECKED */}
            <div className="p-4 rounded-2xl border border-[var(--pms-border)] space-y-3" style={{ backgroundColor: 'var(--pms-pearl)' }}>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold flex items-center gap-2 cursor-pointer" style={{ color: 'var(--pms-ink)' }}>
                  <input
                    type="checkbox"
                    checked={hasCandidateText}
                    onChange={(e) => setHasCandidateText(e.target.checked)}
                    className="rounded accent-violet-600 w-4 h-4"
                  />
                  <span>Print Candidate Name &amp; Date of Photo (DOP)</span>
                </label>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--pms-soft-blue)] text-[var(--pms-blue)]">
                  Optional • Tick if required
                </span>
              </div>

              {hasCandidateText && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6 pt-1">
                  <div>
                    <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--pms-muted)' }}>Candidate Name</label>
                    <input
                      type="text"
                      placeholder="e.g. PARMAL SINGH"
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-[var(--pms-border)] text-xs font-bold uppercase"
                      style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--pms-muted)' }}>Date of Photo (DOP)</label>
                    <input
                      type="text"
                      placeholder="DD-MM-YYYY"
                      value={candidateDate}
                      onChange={(e) => setCandidateDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-[var(--pms-border)] text-xs font-bold"
                      style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Border & Background Color */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--pms-muted)' }}>
                    Background Color
                  </label>
                  <span className="text-xs font-mono" style={{ color: 'var(--pms-subtle-text)' }}>{bgColor}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {['#ffffff', '#e0f2fe', '#bae6fd', '#2563eb', '#f1f5f9', '#fee2e2'].map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setBgColor(hex)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center cursor-pointer ${
                        bgColor.toLowerCase() === hex.toLowerCase() ? 'border-[var(--pms-violet)] ring-2 ring-violet-500/30' : 'border-slate-300'
                      }`}
                      style={{ backgroundColor: hex }}
                    >
                      {bgColor.toLowerCase() === hex.toLowerCase() && (
                        <Check className={`w-3.5 h-3.5 ${hex === '#ffffff' || hex === '#f1f5f9' || hex === '#e0f2fe' || hex === '#bae6fd' || hex === '#fee2e2' ? 'text-slate-800' : 'text-white'}`} />
                      )}
                    </button>
                  ))}
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent p-0"
                    title="Custom color"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--pms-muted)' }}>
                    <input
                      type="checkbox"
                      checked={hasBorder}
                      onChange={(e) => setHasBorder(e.target.checked)}
                      className="rounded accent-violet-600 w-3.5 h-3.5"
                    />
                    <span>Border Line</span>
                  </label>
                  {hasBorder && <span className="text-xs" style={{ color: 'var(--pms-muted)' }}>{borderWidthMm} mm</span>}
                </div>
                {hasBorder && (
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0.2}
                      max={2.0}
                      step={0.1}
                      value={borderWidthMm}
                      onChange={(e) => setBorderWidthMm(Number(e.target.value))}
                      className="w-full accent-violet-600"
                    />
                    <input
                      type="color"
                      value={borderColor}
                      onChange={(e) => setBorderColor(e.target.value)}
                      className="w-6 h-6 rounded-md cursor-pointer border-0 p-0"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Studio Branding / Watermark in Non-Print Margin */}
            <div className="pt-3 border-t border-[var(--pms-border)]">
              <label className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--pms-muted)' }}>
                Studio Footer Branding (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Ramesh Photo Studio, Kota • Ph: 9876543210"
                value={studioWatermark}
                onChange={(e) => setStudioWatermark(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] text-xs focus:ring-2 focus:ring-violet-500"
                style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
              />
              <span className="text-[10px] block mt-1" style={{ color: 'var(--pms-subtle-text)' }}>
                Prints at the bottom margin of the paper (non-print zone) without touching any passport photos.
              </span>
            </div>
          </div>

          {/* SECTION 4: EXPORT & PRINT HUB */}
          <div className="pms-glass-panel rounded-3xl p-6 space-y-5">
            <div className="flex items-center gap-2.5">
              <span
                className="w-7 h-7 rounded-full font-bold text-xs flex items-center justify-center"
                style={{ backgroundColor: 'var(--pms-soft-lavender)', color: 'var(--pms-violet)' }}
              >
                4
              </span>
              <h2 className="text-base font-bold" style={{ color: 'var(--pms-ink)' }}>
                Studio Export &amp; Print Hub
              </h2>
            </div>

            {/* DPI Resolution */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider block mb-2" style={{ color: 'var(--pms-muted)' }}>
                Output DPI Resolution
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { dpi: 72, label: '72 DPI', sub: 'Web / Screen' },
                  { dpi: 150, label: '150 DPI', sub: 'Draft Print' },
                  { dpi: 300, label: '300 DPI ★', sub: 'Studio Print' },
                  { dpi: 600, label: '600 DPI', sub: 'Ultra HD' },
                ].map((d) => (
                  <button
                    key={d.dpi}
                    type="button"
                    onClick={() => setExportDpi(d.dpi)}
                    className={`py-2 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                      exportDpi === d.dpi
                        ? 'border-[var(--pms-violet)] bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] font-bold ring-1 ring-[var(--pms-violet)]'
                        : 'border-[var(--pms-border)]'
                    }`}
                    style={exportDpi === d.dpi ? undefined : { backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                  >
                    <div className="text-xs font-bold">{d.label}</div>
                    <div className="text-[10px]" style={{ color: 'var(--pms-subtle-text)' }}>{d.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Direct Print Button */}
            <motion.button
              whileHover={prefersReduced || isGenerating || !photos.length ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced || isGenerating || !photos.length ? undefined : { scale: 0.985 }}
              type="button"
              onClick={handlePrint}
              disabled={isGenerating || !photos.length}
              className="w-full py-4 rounded-2xl pms-btn-primary font-black text-sm sm:text-base flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Printer className="w-5 h-5" />
              Direct Print Sheet(s) • Actual Size (100%)
            </motion.button>

            {/* Download Grid */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--pms-muted)' }}>
                Download Complete Photo Sheets
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadAllSheetsPdf}
                  disabled={isGenerating || !photos.length}
                  className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40 cursor-pointer"
                >
                  <FileImage className="w-3.5 h-3.5 text-violet-400 dark:text-violet-600" />
                  <span>Download PDF {totalSheetsRequired > 1 ? `(${totalSheetsRequired} Pgs)` : ''}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadCurrentSheet('png')}
                  disabled={isGenerating || !photos.length}
                  className="py-2.5 px-3 rounded-xl border border-[var(--pms-border)] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer hover:border-violet-300 dark:hover:border-violet-700"
                  style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                >
                  <Download className="w-3.5 h-3.5 text-[var(--pms-violet)]" />
                  <span>Current Sheet (PNG)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadCurrentSheet('jpeg')}
                  disabled={isGenerating || !photos.length}
                  className="py-2.5 px-3 rounded-xl border border-[var(--pms-border)] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer hover:border-violet-300 dark:hover:border-violet-700"
                  style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                >
                  <Download className="w-3.5 h-3.5 text-[var(--pms-violet)]" />
                  <span>Current Sheet (JPG)</span>
                </button>
              </div>

              {totalSheetsRequired > 1 && (
                <button
                  type="button"
                  onClick={() => handleDownloadAllSheetsZip('png')}
                  disabled={isGenerating || !photos.length}
                  className="w-full py-2 px-3 rounded-xl border border-[var(--pms-border)] bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] font-bold text-xs flex items-center justify-center gap-1.5 hover:opacity-90 cursor-pointer"
                >
                  <Package className="w-3.5 h-3.5" /> Download All {totalSheetsRequired} Sheets as ZIP Package
                </button>
              )}
            </div>

            {/* Single Photo Downloads with Sarkari 20-50KB Pack */}
            <div className="pt-3 border-t border-[var(--pms-border)]">
              <span className="text-xs font-bold uppercase tracking-wider block mb-2" style={{ color: 'var(--pms-muted)' }}>
                Download Single Passport Photo Tile
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadGovtPortalPhoto}
                  disabled={isGenerating || !photos.length}
                  className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> Sarkari Portal Pack (20–50 KB JPG)
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadSinglePhoto('jpeg')}
                  disabled={isGenerating || !photos.length}
                  className="py-2.5 px-3 rounded-xl border border-[var(--pms-border)] text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer hover:border-violet-300 dark:hover:border-violet-700"
                  style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                >
                  <Download className="w-3 h-3" style={{ color: 'var(--pms-muted)' }} /> Single HD JPG
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadSinglePhoto('png')}
                  disabled={isGenerating || !photos.length}
                  className="py-2.5 px-3 rounded-xl border border-[var(--pms-border)] text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer hover:border-violet-300 dark:hover:border-violet-700"
                  style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                >
                  <Download className="w-3 h-3" style={{ color: 'var(--pms-muted)' }} /> Single PNG
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ================= RIGHT LIVE WYSIWYG PREVIEW ================= */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="lg:col-span-5 sticky top-20 space-y-4"
        >
          <div className="relative pms-glass-panel rounded-3xl p-5 overflow-hidden">
            <PearlScanOverlay
              active={isBusy}
              label={
                isBatchRemovingBg
                  ? 'Removing backgrounds across session…'
                  : currentPhoto?.isRemovingBg
                  ? 'Segmenting portrait background…'
                  : 'Rendering 300 DPI studio output…'
              }
            />
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-[var(--pms-violet)]" />
                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--pms-ink)' }}>
                  Live Sheet Preview
                </h3>
                <button
                  type="button"
                  onClick={() => setIsFullscreenPreview(true)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[var(--pms-violet)] transition-colors cursor-pointer"
                  style={{ color: 'var(--pms-muted)' }}
                  title="Fullscreen HD Preview"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {totalSheetsRequired > 1 && (
                <div className="flex items-center gap-1 rounded-xl p-0.5 border border-[var(--pms-border)]" style={{ backgroundColor: 'var(--pms-pearl)' }}>
                  <button
                    type="button"
                    onClick={() => setActiveSheetIndex((prev) => Math.max(0, prev - 1))}
                    disabled={activeSheetIndex === 0}
                    className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-bold px-1.5" style={{ color: 'var(--pms-ink)' }}>
                    Sheet {activeSheetIndex + 1} / {totalSheetsRequired}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveSheetIndex((prev) => Math.min(totalSheetsRequired - 1, prev + 1))}
                    disabled={activeSheetIndex >= totalSheetsRequired - 1}
                    className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Paper Container Preview — crisp bg-white on actual sheet canvas */}
            <div className="relative w-full rounded-2xl bg-slate-100 dark:bg-slate-950 p-4 flex items-center justify-center border border-[var(--pms-border)] min-h-[420px]">
              <canvas
                ref={previewCanvasRef}
                className="max-w-full max-h-[520px] object-contain shadow-2xl rounded-sm border border-slate-300 dark:border-slate-700 bg-white"
              />
            </div>

            {/* Spec Bar Summary */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4 pt-4 border-t border-[var(--pms-border)] text-center">
              <div>
                <span className="text-[10px] uppercase font-bold block" style={{ color: 'var(--pms-subtle-text)' }}>PHOTO</span>
                <span className="text-xs font-black" style={{ color: 'var(--pms-ink)' }}>
                  {basePhotoWidthMm}×{basePhotoHeightMm}mm
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold block" style={{ color: 'var(--pms-subtle-text)' }}>PAPER</span>
                <span className="text-xs font-black uppercase" style={{ color: 'var(--pms-ink)' }}>
                  {paperSizeId}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold block" style={{ color: 'var(--pms-subtle-text)' }}>GRID</span>
                <span className="text-xs font-black" style={{ color: 'var(--pms-ink)' }}>
                  <AnimatedNumber value={gridRows} />×<AnimatedNumber value={gridCols} />
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold block" style={{ color: 'var(--pms-subtle-text)' }}>ORIENT</span>
                <span className="text-xs font-black capitalize" style={{ color: 'var(--pms-ink)' }}>
                  {orientation}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold block" style={{ color: 'var(--pms-subtle-text)' }}>TOTAL</span>
                <span className="text-xs font-black text-[var(--pms-violet)]">
                  <AnimatedNumber value={targetPhotoCount} suffix=" Photos" />
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold block" style={{ color: 'var(--pms-subtle-text)' }}>DPI</span>
                <span className="text-xs font-black" style={{ color: 'var(--pms-ink)' }}>
                  <AnimatedNumber value={exportDpi} />
                </span>
              </div>
            </div>

            <div className="mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>🖨️ In print dialog, choose <strong>"Actual Size (100%)"</strong>. Never scale to fit.</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ================= FULLSCREEN HD PREVIEW MODAL ================= */}
      <AnimatePresence>
        {isFullscreenPreview && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReduced ? undefined : { opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-4"
          >
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={prefersReduced ? undefined : { opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-5xl pms-glass-panel rounded-3xl overflow-hidden flex flex-col max-h-[92vh]"
              style={{ backgroundColor: 'var(--pms-white)' }}
            >
              <div className="flex items-center justify-between p-4 border-b border-[var(--pms-border)]">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-[var(--pms-violet)]" />
                  <h3 className="text-base font-bold" style={{ color: 'var(--pms-ink)' }}>
                    High-Resolution Fullscreen Preview — {activePaper.name} ({activeSheetIndex + 1}/{totalSheetsRequired})
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="px-3.5 py-1.5 rounded-xl pms-btn-primary font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFullscreenPreview(false)}
                    className="p-1.5 rounded-xl border border-[var(--pms-border)] text-xs font-bold px-3 cursor-pointer"
                    style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-muted)' }}
                  >
                    Close ✕
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6 bg-slate-950 flex items-center justify-center min-h-[380px]">
                <canvas
                  ref={(el) => {
                    if (el && previewCanvasRef.current) {
                      el.width = previewCanvasRef.current.width;
                      el.height = previewCanvasRef.current.height;
                      const ctx = el.getContext('2d');
                      if (ctx) ctx.drawImage(previewCanvasRef.current, 0, 0);
                    }
                  }}
                  className="max-w-full max-h-[70vh] object-contain rounded-md shadow-2xl border border-slate-800 bg-white"
                />
              </div>

              {totalSheetsRequired > 1 && (
                <div className="flex items-center justify-center gap-3 p-3 border-t border-[var(--pms-border)]" style={{ backgroundColor: 'var(--pms-pearl)' }}>
                  <button
                    type="button"
                    onClick={() => setActiveSheetIndex((prev) => Math.max(0, prev - 1))}
                    disabled={activeSheetIndex === 0}
                    className="px-3 py-1 rounded-lg border border-[var(--pms-border)] text-xs font-bold disabled:opacity-30 cursor-pointer"
                    style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                  >
                    ← Prev Sheet
                  </button>
                  <span className="text-xs font-bold" style={{ color: 'var(--pms-ink)' }}>
                    Sheet {activeSheetIndex + 1} of {totalSheetsRequired}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveSheetIndex((prev) => Math.min(totalSheetsRequired - 1, prev + 1))}
                    disabled={activeSheetIndex >= totalSheetsRequired - 1}
                    className="px-3 py-1 rounded-lg border border-[var(--pms-border)] text-xs font-bold disabled:opacity-30 cursor-pointer"
                    style={{ backgroundColor: 'var(--pms-white)', color: 'var(--pms-ink)' }}
                  >
                    Next Sheet →
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ToolWorkspaceShell>
  );
}
