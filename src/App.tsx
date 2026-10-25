import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import Layout from './components/Layout';
import Home from './pages/Home';

// ── Lazy Loaded Tool & Informational Pages (Code Splitting for Core Web Vitals) ──
const MergePDF = lazy(() => import('./pages/MergePDF'));
const SplitPDF = lazy(() => import('./pages/SplitPDF'));
const CompressPDF = lazy(() => import('./pages/CompressPDF'));
const PDFToJPG = lazy(() => import('./pages/PDFToJPG'));
const JPGToPDF = lazy(() => import('./pages/JPGToPDF'));
const OrganizePDF = lazy(() => import('./pages/OrganizePDF'));
const ProtectPDF = lazy(() => import('./pages/ProtectPDF'));
const UnlockPDF = lazy(() => import('./pages/UnlockPDF'));
const WatermarkPDF = lazy(() => import('./pages/WatermarkPDF'));
const RemoveWatermark = lazy(() => import('./pages/RemoveWatermark'));
const PageNumbersPDF = lazy(() => import('./pages/PageNumbersPDF'));
const ExtractText = lazy(() => import('./pages/ExtractText'));
const EditMetadata = lazy(() => import('./pages/EditMetadata'));
const FlattenPDF = lazy(() => import('./pages/FlattenPDF'));
const ReversePDF = lazy(() => import('./pages/ReversePDF'));
const AddMargins = lazy(() => import('./pages/AddMargins'));
const AllTools = lazy(() => import('./pages/AllTools'));
const Privacy = lazy(() => import('./pages/Privacy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const About = lazy(() => import('./pages/About'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Contact = lazy(() => import('./pages/Contact'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

// Native Tools
const GrayscalePDF = lazy(() => import('./pages/GrayscalePDF'));
const InvertColorsPDF = lazy(() => import('./pages/InvertColorsPDF'));
const RemoveMetadata = lazy(() => import('./pages/RemoveMetadata'));
const PasswordStrength = lazy(() => import('./pages/PasswordStrength'));
const ConvertToWebP = lazy(() => import('./pages/ConvertToWebP'));
const BatesNumbering = lazy(() => import('./pages/BatesNumbering'));
const HeadersFooters = lazy(() => import('./pages/HeadersFooters'));
const HandwritingPDF = lazy(() => import('./pages/HandwritingPDF'));

// Conversion & Complex Tools
const ExtractAllImages = lazy(() => import('./pages/ExtractAllImages'));
const PdfToWord = lazy(() => import('./pages/PdfToWord'));
const PdfToExcel = lazy(() => import('./pages/PdfToExcel'));
const PdfToPpt = lazy(() => import('./pages/PdfToPpt'));
const ExtractTables = lazy(() => import('./pages/ExtractTables'));
const FontExtractor = lazy(() => import('./pages/FontExtractor'));
const SearchReplace = lazy(() => import('./pages/SearchReplace'));
const RemoveText = lazy(() => import('./pages/RemoveText'));
const HighlightText = lazy(() => import('./pages/HighlightText'));
const PdfToGif = lazy(() => import('./pages/PdfToGif'));
const VideoToPdf = lazy(() => import('./pages/VideoToPdf'));
const RemoveBackground = lazy(() => import('./pages/RemoveBackground'));
const WordToPdfExact = lazy(() => import('./pages/WordToPdfExact'));
const ConvertToTiff = lazy(() => import('./pages/ConvertToTiff'));
const ExtractMedia = lazy(() => import('./pages/ExtractMedia'));
const CryptographicSignatures = lazy(() => import('./pages/CryptographicSignatures'));
const ValidateSignatures = lazy(() => import('./pages/ValidateSignatures'));
const PdfAConversion = lazy(() => import('./pages/PdfAConversion'));
const AddDrm = lazy(() => import('./pages/AddDrm'));
const InvisibleWatermark = lazy(() => import('./pages/InvisibleWatermark'));
const SelfDestruct = lazy(() => import('./pages/SelfDestruct'));
const CertifyDocument = lazy(() => import('./pages/CertifyDocument'));
const BatchProtect = lazy(() => import('./pages/BatchProtect'));
const InkSaverPDF = lazy(() => import('./pages/InkSaverPDF'));
const UniversalConverter = lazy(() => import('./pages/UniversalConverter'));
const CodeToPdf = lazy(() => import('./pages/CodeToPdf'));

// Document Optimization & Maintenance
const PdfSanitizer = lazy(() => import('./pages/PdfSanitizer'));
const CmykConverter = lazy(() => import('./pages/CmykConverter'));
const PdfRepair = lazy(() => import('./pages/PdfRepair'));
const WebpageToPdf = lazy(() => import('./pages/WebpageToPdf'));
const PdfToMarkdown = lazy(() => import('./pages/PdfToMarkdown'));
const NUpLayout = lazy(() => import('./pages/NUpLayout'));
const AutoCropMargins = lazy(() => import('./pages/AutoCropMargins'));
const LongImageToPdf = lazy(() => import('./pages/LongImageToPdf'));
const PdfFontReplacer = lazy(() => import('./pages/PdfFontReplacer'));
const AccessibilityChecker = lazy(() => import('./pages/AccessibilityChecker'));
const PdfToAudio = lazy(() => import('./pages/PdfToAudio'));
const LinkExtractor = lazy(() => import('./pages/LinkExtractor'));
const ReadingTracker = lazy(() => import('./pages/ReadingTracker'));

// Image & Interactive Tools
const ImageCollage = lazy(() => import('./pages/ImageCollage'));
const QrCodeGenerator = lazy(() => import('./pages/QrCodeGenerator'));
const SignaturePad = lazy(() => import('./pages/SignaturePad'));
const DocumentScanner = lazy(() => import('./pages/DocumentScanner'));
const PdfComparison = lazy(() => import('./pages/PdfComparison'));
const SmartImageToPdf = lazy(() => import('./pages/SmartImageToPdf'));
const PdfFormFiller = lazy(() => import('./pages/PdfFormFiller'));
const ImageColorCorrection = lazy(() => import('./pages/ImageColorCorrection'));
const PdfPageCropper = lazy(() => import('./pages/PdfPageCropper'));
const ImageNoiseReduction = lazy(() => import('./pages/ImageNoiseReduction'));
const ImageInsertTool = lazy(() => import('./pages/ImageInsertTool'));
const SearchablePdf = lazy(() => import('./pages/SearchablePdf'));

// Advanced Feature Pages
const PdfStats = lazy(() => import('./pages/PdfStats'));
const ExtractPages = lazy(() => import('./pages/ExtractPages'));
const Booklet = lazy(() => import('./pages/Booklet'));
const DuplicatePages = lazy(() => import('./pages/DuplicatePages'));
const RotatePages = lazy(() => import('./pages/RotatePages'));
const RedactPdf = lazy(() => import('./pages/RedactPdf'));
const ImageConverter = lazy(() => import('./pages/ImageConverter'));
const ImageWatermark = lazy(() => import('./pages/ImageWatermark'));
const ImageCrop = lazy(() => import('./pages/ImageCrop'));
const ImageMetadata = lazy(() => import('./pages/ImageMetadata'));
const ScreenshotToPdf = lazy(() => import('./pages/ScreenshotToPdf'));
const PageCounter = lazy(() => import('./pages/PageCounter'));
const PdfStamp = lazy(() => import('./pages/PdfStamp'));
const RemoveBlankPages = lazy(() => import('./pages/RemoveBlankPages'));
const PdfToImages = lazy(() => import('./pages/PdfToImages'));
const ImageToBase64 = lazy(() => import('./pages/ImageToBase64'));
const PdfOverlay = lazy(() => import('./pages/PdfOverlay'));
const ColorExtractor = lazy(() => import('./pages/ColorExtractor'));
const PdfPresenter = lazy(() => import('./pages/PdfPresenter'));
const FileHash = lazy(() => import('./pages/FileHash'));

const AdvancedEditor = lazy(() => import('./pages/AdvancedEditor'));
const TargetPDFCompress = lazy(() => import('./pages/TargetPDFCompress'));
const ExactImageSize = lazy(() => import('./pages/ExactImageSize'));
const PixelResizer = lazy(() => import('./pages/PixelResizer'));
const ImageResizer = lazy(() => import('./pages/ImageResizer'));
const ImageTextEditor = lazy(() => import('./pages/ImageTextEditor'));
const PassportPhotoSheet = lazy(() => import('./pages/PassportPhotoSheet'));
const IncreasePdfSize = lazy(() => import('./pages/IncreasePdfSize'));
const IdCardJoiner = lazy(() => import('./pages/IdCardJoiner'));
const SarkariPhotoSignature = lazy(() => import('./pages/SarkariPhotoSignature'));
const CleanSignature = lazy(() => import('./pages/CleanSignature'));
const MaskedAadhaar = lazy(() => import('./pages/MaskedAadhaar'));
const ExamDocumentMerger = lazy(() => import('./pages/ExamDocumentMerger'));
const AiPdfSummarizer = lazy(() => import('./pages/AiPdfSummarizer'));
const NotFound = lazy(() => import('./pages/NotFound'));

export default function App() {
  // ── Backend Warmup Ping ─────────────────────────────────────────
  useEffect(() => {
    const API_BASE = import.meta.env.VITE_API_URL;
    if (API_BASE && API_BASE.startsWith('http') && !API_BASE.includes('localhost')) {
      fetch(`${API_BASE}/health`, { method: 'HEAD' }).catch(() => {/* silent */});
    }
  }, []);

  return (
    <ToastProvider>
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0f172a' }}>
        <div style={{ width: 48, height: 48, border: '4px solid #334155', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    }>
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="merge" element={<MergePDF />} />
        <Route path="split" element={<SplitPDF />} />
        <Route path="compress" element={<CompressPDF />} />
        <Route path="pdf-to-jpg" element={<PDFToJPG />} />
        <Route path="jpg-to-pdf" element={<JPGToPDF />} />
        <Route path="organize" element={<OrganizePDF />} />
        <Route path="protect" element={<ProtectPDF />} />
        <Route path="unlock" element={<UnlockPDF />} />
        <Route path="watermark" element={<WatermarkPDF />} />
        <Route path="remove-watermark" element={<RemoveWatermark />} />
        <Route path="page-numbers" element={<PageNumbersPDF />} />
        <Route path="edit" element={<AdvancedEditor />} />
        <Route path="target-compress" element={<TargetPDFCompress />} />
        <Route path="exact-image-size" element={<ExactImageSize />} />
        <Route path="pixel-resizer" element={<PixelResizer />} />
        <Route path="image-resizer" element={<ImageResizer />} />
        <Route path="image-text-editor" element={<ImageTextEditor />} />
        <Route path="searchable-pdf" element={<SearchablePdf />} />
        <Route path="extract-text" element={<ExtractText />} />
        <Route path="edit-metadata" element={<EditMetadata />} />
        <Route path="flatten-pdf" element={<FlattenPDF />} />
        <Route path="reverse" element={<ReversePDF />} />
        <Route path="add-margins" element={<AddMargins />} />
        <Route path="all-tools" element={<AllTools />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="terms" element={<TermsOfService />} />
        <Route path="about" element={<About />} />
        <Route path="team" element={<About />} />
        <Route path="leadership" element={<About />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="contact" element={<Contact />} />

        {/* Native & Core Tools */}
        <Route path="grayscale-pdf" element={<GrayscalePDF />} />
        <Route path="invert-colors" element={<InvertColorsPDF />} />
        <Route path="remove-metadata" element={<RemoveMetadata />} />
        <Route path="password-strength" element={<PasswordStrength />} />
        <Route path="convert-webp" element={<ConvertToWebP />} />
        <Route path="bates-numbering" element={<BatesNumbering />} />
        <Route path="headers-footers" element={<HeadersFooters />} />

        <Route path="extract-images" element={<ExtractAllImages />} />
        <Route path="pdf-to-word" element={<PdfToWord />} />
        <Route path="pdf-to-excel" element={<PdfToExcel />} />
        <Route path="pdf-to-ppt" element={<PdfToPpt />} />
        <Route path="word-to-pdf-exact" element={<WordToPdfExact />} />
        <Route path="extract-tables" element={<ExtractTables />} />
        <Route path="font-extractor" element={<FontExtractor />} />
        <Route path="search-replace" element={<SearchReplace />} />
        <Route path="remove-text" element={<RemoveText />} />
        <Route path="highlight-text" element={<HighlightText />} />
        <Route path="pdf-to-gif" element={<PdfToGif />} />
        <Route path="video-to-pdf" element={<VideoToPdf />} />
        <Route path="remove-background" element={<RemoveBackground />} />
        <Route path="passport-photo-sheet" element={<PassportPhotoSheet />} />
        <Route path="convert-tiff" element={<ConvertToTiff />} />
        <Route path="extract-media" element={<ExtractMedia />} />

        <Route path="crypto-sign" element={<CryptographicSignatures />} />
        <Route path="validate-signatures" element={<ValidateSignatures />} />
        <Route path="pdf-a-conversion" element={<PdfAConversion />} />
        <Route path="add-drm" element={<AddDrm />} />
        <Route path="invisible-watermark" element={<InvisibleWatermark />} />
        <Route path="self-destruct" element={<SelfDestruct />} />
        <Route path="certify-document" element={<CertifyDocument />} />
        <Route path="batch-protect" element={<BatchProtect />} />
        <Route path="ink-saver" element={<InkSaverPDF />} />
        <Route path="universal-converter" element={<UniversalConverter />} />
        <Route path="code-to-pdf" element={<CodeToPdf />} />

        {/* 10 Advanced Tools */}
        <Route path="image-collage" element={<ImageCollage />} />
        <Route path="qr-code" element={<QrCodeGenerator />} />
        <Route path="signature-pad" element={<SignaturePad />} />
        <Route path="document-scanner" element={<DocumentScanner />} />
        <Route path="pdf-comparison" element={<PdfComparison />} />
        <Route path="smart-image-to-pdf" element={<SmartImageToPdf />} />
        <Route path="pdf-form-filler" element={<PdfFormFiller />} />
        <Route path="image-color-correction" element={<ImageColorCorrection />} />
        <Route path="pdf-page-cropper" element={<PdfPageCropper />} />
        <Route path="image-noise-reduction" element={<ImageNoiseReduction />} />
        <Route path="image-insert" element={<ImageInsertTool />} />
        <Route path="handwriting-pdf" element={<HandwritingPDF />} />

        {/* 20 Advanced Features */}
        <Route path="pdf-stats" element={<PdfStats />} />
        <Route path="extract-pages" element={<ExtractPages />} />
        <Route path="booklet" element={<Booklet />} />
        <Route path="duplicate-pages" element={<DuplicatePages />} />
        <Route path="rotate-pages" element={<RotatePages />} />
        <Route path="redact" element={<RedactPdf />} />
        <Route path="image-converter" element={<ImageConverter />} />
        <Route path="image-watermark" element={<ImageWatermark />} />
        <Route path="image-crop" element={<ImageCrop />} />
        <Route path="image-metadata" element={<ImageMetadata />} />
        <Route path="screenshot-to-pdf" element={<ScreenshotToPdf />} />
        <Route path="page-counter" element={<PageCounter />} />
        <Route path="stamp" element={<PdfStamp />} />
        <Route path="remove-blank-pages" element={<RemoveBlankPages />} />
        <Route path="pdf-to-images" element={<PdfToImages />} />
        <Route path="image-to-base64" element={<ImageToBase64 />} />
        <Route path="pdf-overlay" element={<PdfOverlay />} />
        <Route path="color-extractor" element={<ColorExtractor />} />
        <Route path="present" element={<PdfPresenter />} />
        <Route path="file-hash" element={<FileHash />} />
        <Route path="increase-size" element={<IncreasePdfSize />} />
        <Route path="id-card-joiner" element={<IdCardJoiner />} />

        {/* 13 Utility Features */}
        <Route path="pdf-sanitizer" element={<PdfSanitizer />} />
        <Route path="cmyk-converter" element={<CmykConverter />} />
        <Route path="pdf-repair" element={<PdfRepair />} />
        <Route path="webpage-to-pdf" element={<WebpageToPdf />} />
        <Route path="pdf-to-markdown" element={<PdfToMarkdown />} />
        <Route path="n-up-layout" element={<NUpLayout />} />
        <Route path="auto-crop-margins" element={<AutoCropMargins />} />
        <Route path="long-image-to-pdf" element={<LongImageToPdf />} />
        <Route path="font-replacer" element={<PdfFontReplacer />} />
        <Route path="accessibility-checker" element={<AccessibilityChecker />} />
        <Route path="pdf-to-audio" element={<PdfToAudio />} />
        <Route path="link-extractor" element={<LinkExtractor />} />
        <Route path="reading-tracker" element={<ReadingTracker />} />

        {/* 4 Exam & Sarkari Tools */}
        <Route path="sarkari-photo-signature" element={<SarkariPhotoSignature />} />
        <Route path="clean-signature" element={<CleanSignature />} />
        <Route path="masked-aadhaar" element={<MaskedAadhaar />} />
        <Route path="exam-document-merger" element={<ExamDocumentMerger />} />
        
        {/* AI Tools */}
        <Route path="ai-summarizer" element={<AiPdfSummarizer />} />
        <Route path="ai-pdf-summarizer" element={<AiPdfSummarizer />} />

        {/* Admin Telemetry Dashboard */}
        <Route path="admin" element={<AdminDashboard />} />

        {/* 404 Catch-All Route: Eliminates Soft-404 Errors in Google Search Console */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </Suspense>
    </ToastProvider>
  );
}
