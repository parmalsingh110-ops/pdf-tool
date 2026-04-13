import { lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import MergePDF from './pages/MergePDF';
import SplitPDF from './pages/SplitPDF';
import CompressPDF from './pages/CompressPDF';
import PDFToJPG from './pages/PDFToJPG';
import JPGToPDF from './pages/JPGToPDF';
import OrganizePDF from './pages/OrganizePDF';
import ProtectPDF from './pages/ProtectPDF';
import UnlockPDF from './pages/UnlockPDF';
import WatermarkPDF from './pages/WatermarkPDF';
import PageNumbersPDF from './pages/PageNumbersPDF';
import ExtractText from './pages/ExtractText';
import EditMetadata from './pages/EditMetadata';
import FlattenPDF from './pages/FlattenPDF';
import ReversePDF from './pages/ReversePDF';
import AddMargins from './pages/AddMargins';
import AllTools from './pages/AllTools';
import Privacy from './pages/Privacy';

// Native Tools
import GrayscalePDF from './pages/GrayscalePDF';
import InvertColorsPDF from './pages/InvertColorsPDF';
import RemoveMetadata from './pages/RemoveMetadata';
import PasswordStrength from './pages/PasswordStrength';
import ConvertToWebP from './pages/ConvertToWebP';
import BatesNumbering from './pages/BatesNumbering';
import HeadersFooters from './pages/HeadersFooters';

// Simulated Tools
import ExtractAllImages from './pages/ExtractAllImages';
import PdfToWord from './pages/PdfToWord';
import PdfToExcel from './pages/PdfToExcel';
import PdfToPpt from './pages/PdfToPpt';
import ExtractTables from './pages/ExtractTables';
import FontExtractor from './pages/FontExtractor';
import SearchReplace from './pages/SearchReplace';
import RemoveText from './pages/RemoveText';
import HighlightText from './pages/HighlightText';
import PdfToGif from './pages/PdfToGif';
import VideoToPdf from './pages/VideoToPdf';
import RemoveBackground from './pages/RemoveBackground';
import ConvertToTiff from './pages/ConvertToTiff';
import ExtractMedia from './pages/ExtractMedia';
import CryptographicSignatures from './pages/CryptographicSignatures';
import ValidateSignatures from './pages/ValidateSignatures';
import PdfAConversion from './pages/PdfAConversion';
import AddDrm from './pages/AddDrm';
import InvisibleWatermark from './pages/InvisibleWatermark';
import SelfDestruct from './pages/SelfDestruct';
import CertifyDocument from './pages/CertifyDocument';
import BatchProtect from './pages/BatchProtect';
import InkSaverPDF from './pages/InkSaverPDF';
import UniversalConverter from './pages/UniversalConverter';

// New Advanced Tools
import ImageCollage from './pages/ImageCollage';
import QrCodeGenerator from './pages/QrCodeGenerator';
import SignaturePad from './pages/SignaturePad';
import DocumentScanner from './pages/DocumentScanner';
import PdfComparison from './pages/PdfComparison';
import SmartImageToPdf from './pages/SmartImageToPdf';
import PdfFormFiller from './pages/PdfFormFiller';
import ImageColorCorrection from './pages/ImageColorCorrection';
import PdfPageCropper from './pages/PdfPageCropper';
import ImageNoiseReduction from './pages/ImageNoiseReduction';
import ImageInsertTool from './pages/ImageInsertTool';

const AdvancedEditor = lazy(() => import('./pages/AdvancedEditor'));
const TargetPDFCompress = lazy(() => import('./pages/TargetPDFCompress'));
const ExactImageSize = lazy(() => import('./pages/ExactImageSize'));
const PixelResizer = lazy(() => import('./pages/PixelResizer'));
const ImageResizer = lazy(() => import('./pages/ImageResizer'));
const ImageTextEditor = lazy(() => import('./pages/ImageTextEditor'));
const PassportPhotoSheet = lazy(() => import('./pages/PassportPhotoSheet'));

export default function App() {
  return (
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
          <Route path="page-numbers" element={<PageNumbersPDF />} />
          <Route path="edit" element={<AdvancedEditor />} />
          <Route path="target-compress" element={<TargetPDFCompress />} />
          <Route path="exact-image-size" element={<ExactImageSize />} />
          <Route path="pixel-resizer" element={<PixelResizer />} />
          <Route path="image-resizer" element={<ImageResizer />} />
          <Route path="image-text-editor" element={<ImageTextEditor />} />
          <Route path="extract-text" element={<ExtractText />} />
          <Route path="edit-metadata" element={<EditMetadata />} />
          <Route path="flatten-pdf" element={<FlattenPDF />} />
          <Route path="reverse" element={<ReversePDF />} />
          <Route path="add-margins" element={<AddMargins />} />
          <Route path="all-tools" element={<AllTools />} />
          <Route path="privacy" element={<Privacy />} />

          {/* New 29 Native & Simulated Tools */}
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

          {/* 10 New Advanced Tools */}
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
        </Route>
    </Routes>
  );
}
