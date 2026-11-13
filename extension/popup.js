/**
 * PDF Media Suite — Advanced Popup Controller v2.0
 * Features:
 * - PDF Tab Detection Banner
 * - Recent Files History (chrome.storage)
 * - 110+ Tools Catalog with full search
 * - Category Tabs (Popular/PDF/Convert/Image/Sarkari/Security/All)
 * - Smart Dropzone (opens right tool based on file type)
 * - Skeleton loaders + smooth animations
 * - UTM tracking on all links
 */

const BASE_URL = 'https://www.pdfmediasuite.in';

// ─── FULL TOOLS CATALOG (130+ tools) ──────────────────────────────────────
const TOOLS_CATALOG = [
  // ⭐ Popular
  { id: 'scan-to-print',    name: 'Scan to Print (QR Web-Drop)', desc: 'Mobile-to-PC wireless print drop via QR code — no WhatsApp needed', category: 'popular', icon: '🖨️', path: '/scan-to-print', badge: '🔥 Hot', tags: ['scan to print','qr code','print drop','whatsapp print','cyber cafe','emitra','mobile to pc','wireless print'] },
  { id: 'target-compress',  name: 'Target Size PDF Compress',   desc: 'Compress PDF to strict KB or MB limits (100KB, 500KB, 1MB, 2MB)', category: 'popular', icon: '🎯', path: '/target-compress', badge: 'KB & MB', tags: ['target compress','exact size','kb','mb','strict limit','reduce to 100kb','reduce to 200kb','sarkari compress'] },
  { id: 'compress',         name: 'Compress PDF',               desc: 'Reduce size while optimizing for maximal quality', category: 'popular',  icon: '⚡', path: '/compress',               badge: 'Popular',   tags: ['compress','reduce','size','small','kb','mb','lite'] },
  { id: 'merge',            name: 'Merge PDF',                  desc: 'Combine multiple PDFs with page previews',          category: 'popular',  icon: '📑', path: '/merge',                  badge: 'Popular',   tags: ['merge','combine','join','multiple','append'] },
  { id: 'pdf-to-word',      name: 'PDF to Word (.docx)',        desc: 'Convert PDF to editable Word document losslessly',  category: 'popular',  icon: '📝', path: '/pdf-to-word',            badge: 'Best',      tags: ['pdf to word','docx','word','convert','editable'] },
  { id: 'passport-sheet',   name: 'Passport Photo 4x6 Sheet',  desc: 'Create printable 8/16/32 passport photos with dress change', category: 'popular', icon: '👔', path: '/passport-photo-sheet', badge: 'Print', tags: ['passport photo','photo sheet','4x6','a4','dress change','print photos','id photo'] },
  { id: 'clean-signature',  name: 'Clean Paper Signature',       desc: 'Photo of handwritten sign to transparent PNG or white JPG (custom KB)', category: 'popular', icon: '✍️', path: '/clean-signature', badge: 'Pure Ink', tags: ['signature','clean','transparent','remove background','govt form','pure white','20kb'] },
  { id: 'smart-kyc',        name: 'Smart KYC Slip Maker',       desc: 'Combine Aadhaar + PAN + Bank passbook on 1 KYC page', category: 'popular', icon: '📋', path: '/smart-kyc-slip', badge: 'KYC AI', tags: ['kyc','smart kyc','aadhaar','pan','bank passbook','account opening','csc','emitra'] },
  { id: 'sarkari-photo',    name: 'Sarkari Photo & Sign Maker', desc: 'Resize photo & sign to 20–50 KB govt format',       category: 'popular',  icon: '🇮🇳', path: '/sarkari-photo-signature', badge: 'Govt KYC', tags: ['sarkari','photo','signature','sign','20kb','50kb','government','recruitment','form'] },
  { id: 'unlock',           name: 'Unlock Protected PDF',       desc: 'Remove password & permissions losslessly',          category: 'popular',  icon: '🔓', path: '/unlock',                  badge: 'Lossless',  tags: ['unlock','password','remove password','decrypt','protected'] },
  { id: 'scanner',          name: 'Smart Document Scanner',     desc: 'Scan & perspective-warp docs with auto crop',       category: 'popular',  icon: '📷', path: '/document-scanner',       badge: 'AI Scan',   tags: ['scan','scanner','document','camera','perspective','warp','crop'] },

  // 🖨️ Cyber Cafe & Xerox Shop Station
  { id: 'shop-scan-to-print', name: 'Scan to Print (QR Web-Drop)', desc: 'Customers scan counter QR on phone to beam docs directly to your PC', category: 'shop', icon: '🖨️', path: '/scan-to-print', badge: 'Super Tool', tags: ['scan to print','cyber cafe','emitra','qr print','shopkeeper','xerox','counter print'] },
  { id: 'shop-kiosk',         name: 'Counter Kiosk Display',      desc: 'Full screen shopkeeper counter display for customer QR file drop', category: 'shop', icon: '🖥️', path: '/counter-kiosk', badge: 'Kiosk Mode', tags: ['kiosk','counter','display','cyber cafe','shop','customer screen','fullscreen'] },
  { id: 'shop-print-calc',    name: 'Print & Xerox Cost Calculator', desc: 'Calculate paper, ink, toner costs, customer billing & margins', category: 'shop', icon: '💰', path: '/print-cost-calculator', badge: 'Profit Tool', tags: ['print cost','calculator','xerox cost','billing','rates','cyber cafe profit','margin'] },
  { id: 'shop-smart-kyc',     name: 'Smart KYC Slip Maker',       desc: 'Combine Aadhaar + PAN + Bank passbook onto a verified 1-page slip', category: 'shop', icon: '📋', path: '/smart-kyc-slip', badge: 'Banking KYC', tags: ['kyc','aadhaar','pan','bank passbook','account opening','csc','emitra'] },
  { id: 'shop-admit-card',    name: 'Admit Card & Hall Ticket Optimizer', desc: 'Auto-crop roll number slip & enhance contrast for crisp 1-page print', category: 'shop', icon: '🎟️', path: '/admit-card-optimizer', badge: 'Exam Slip', tags: ['admit card','hall ticket','roll number','crop admit card','ssc admit card','upsc hall ticket','clean print'] },
  { id: 'shop-zero-trace',    name: 'Zero-Trace In-Memory Print', desc: 'Print confidential documents in RAM with zero hard drive residual cache', category: 'shop', icon: '🛡️', path: '/zero-trace-print', badge: 'Zero Trace', tags: ['zero trace','confidential print','private print','ram print','no disk save','secure print'] },
  { id: 'shop-passport',      name: 'Passport Photo 4x6 Sheet',   desc: 'Generate printable 8, 16, or 32 passport photos with smart dress change', category: 'shop', icon: '👔', path: '/passport-photo-sheet', badge: 'Print Ready', tags: ['passport photo','photo sheet','4x6','a4','dress change','print photo','id photo'] },
  { id: 'shop-clean-sign',    name: 'Clean Paper Signature',      desc: 'Clean phone photo signature to transparent PNG or 10-20KB white JPG', category: 'shop', icon: '✍️', path: '/clean-signature', badge: 'Pure Ink', tags: ['signature','clean signature','transparent','white background','paper sign','crop signature','20kb'] },
  { id: 'shop-court-evidence',name: 'Court Evidence & 65B Formatter', desc: 'Format WhatsApp chats & evidence with Bates stamps & 65B Certificate', category: 'shop', icon: '⚖️', path: '/court-evidence-formatter', badge: 'Legal', tags: ['court','evidence','65b','bates','legal','affidavit','lawyer','advocate'] },
  { id: 'shop-self-attest',   name: 'Self-Attestation Generator', desc: 'Apply digital self-attested signature stamp & date across document pages', category: 'shop', icon: '🖋️', path: '/self-attest', badge: 'Self Attest', tags: ['self attest','self attestation','signature stamp','verified copy','govt upload'] },
  { id: 'shop-pamphlet',      name: 'Pamphlet & Handbill Maker',  desc: 'Design and layout 2-fold / 4-fold printable promotional pamphlets', category: 'shop', icon: '📢', path: '/pamphlet-maker', badge: 'Flyers', tags: ['pamphlet','handbill','flyer','leaflet','broucher','marketing','printing'] },
  { id: 'shop-target-compress',name: 'Target Size PDF Compress',  desc: 'Strictly compress PDF under 100 KB, 200 KB, 1 MB, 2 MB for portal uploads', category: 'shop', icon: '🎯', path: '/target-compress', badge: 'KB & MB', tags: ['target compress','strict kb','mb','reduce file size'] },

  // 📄 PDF Tools
  { id: 'split',            name: 'Split PDF',                  desc: 'Extract page ranges or split into single pages',    category: 'pdf',      icon: '✂️', path: '/split',                  badge: null,        tags: ['split','divide','extract pages','separate','range'] },
  { id: 'rotate',           name: 'Rotate PDF Pages',           desc: 'Rotate pages 90°, 180°, 270° individually',        category: 'pdf',      icon: '🔄', path: '/rotate-pages',           badge: null,        tags: ['rotate','turn','landscape','portrait','orientation'] },
  { id: 'organize',         name: 'Organize PDF Pages',         desc: 'Reorder, duplicate, delete pages visually',         category: 'pdf',      icon: '🗂️', path: '/organize',               badge: null,        tags: ['organize','reorder','sort','delete page','rearrange'] },
  { id: 'watermark',        name: 'Watermark PDF',              desc: 'Add text or logo watermarks with opacity/angle',    category: 'pdf',      icon: '💧', path: '/watermark',              badge: null,        tags: ['watermark','logo','stamp','text watermark','opacity'] },
  { id: 'page-numbers',     name: 'Add Page Numbers',           desc: 'Insert headers, footers & bates numbering',         category: 'pdf',      icon: '🔢', path: '/page-numbers',           badge: null,        tags: ['page numbers','header','footer','bates','numbering','pagination'] },
  { id: 'pdf-editor',       name: 'Advanced PDF Editor',        desc: 'Add text, shapes, signatures & annotations',        category: 'pdf',      icon: '✏️', path: '/edit',                   badge: 'Full Edit', tags: ['edit','editor','annotate','text','draw','highlight','signature'] },
  { id: 'bookmarks',        name: 'Create Bookmarks / TOC',     desc: 'Create native PDF Table of Contents outlines',      category: 'pdf',      icon: '🔖', path: '/create-bookmarks',       badge: null,        tags: ['bookmarks','toc','table of contents','outline','chapter'] },
  { id: 'flatten',          name: 'Flatten PDF',                desc: 'Lock form fields & flatten annotations permanently', category: 'pdf',      icon: '🥞', path: '/flatten-pdf',            badge: null,        tags: ['flatten','form','lock','fields','annotations'] },
  { id: 'redact',           name: 'Redact PDF (Auto PII Scan)', desc: 'Permanently blackout Aadhaar, PAN, emails & PII',   category: 'pdf',      icon: '⬛', path: '/redact',                  badge: 'Auto PII',  tags: ['redact','blackout','censor','pii','aadhaar','pan','email','hide'] },
  { id: 'remove-text',      name: 'Remove Text from PDF',       desc: 'Whiteout or erase specific text regions',           category: 'pdf',      icon: '🧹', path: '/remove-text',            badge: null,        tags: ['remove text','erase','whiteout','delete text','clean'] },
  { id: 'add-margins',      name: 'Add Margins to PDF',         desc: 'Add blank margins or padding around pages',         category: 'pdf',      icon: '📐', path: '/add-margins',            badge: null,        tags: ['margins','padding','border','white space','add space'] },
  { id: 'n-up',             name: 'N-Up PDF Layout',            desc: 'Print multiple pages on single sheet (2-up, 4-up)', category: 'pdf',      icon: '🗃️', path: '/n-up-layout',            badge: null,        tags: ['n-up','2up','4up','multiple pages','print layout','booklet'] },
  { id: 'search-replace',   name: 'Search & Replace in PDF',    desc: 'Find and replace any text inside PDFs',             category: 'pdf',      icon: '🔍', path: '/search-replace',         badge: null,        tags: ['search','find','replace','text replace','ctrl f'] },
  { id: 'duplicate-pages',  name: 'Duplicate PDF Pages',        desc: 'Clone specific pages within a PDF document',        category: 'pdf',      icon: '📋', path: '/duplicate-pages',        badge: null,        tags: ['duplicate','clone','copy page','repeat'] },
  { id: 'reverse',          name: 'Reverse PDF Pages',          desc: 'Flip page order from last to first',                category: 'pdf',      icon: '↩️', path: '/reverse',                badge: null,        tags: ['reverse','flip order','last first','invert pages'] },
  { id: 'remove-blank',     name: 'Remove Blank Pages',         desc: 'Auto-detect and delete empty pages',                category: 'pdf',      icon: '🗑️', path: '/remove-blank-pages',     badge: null,        tags: ['blank pages','empty pages','remove blank','clean up'] },
  { id: 'overlay',          name: 'PDF Overlay / Stamp',        desc: 'Overlay one PDF on top of another as a stamp',      category: 'pdf',      icon: '🎭', path: '/pdf-overlay',            badge: null,        tags: ['overlay','stamp','combine layers','superimpose'] },
  { id: 'extract-pages',    name: 'Extract Pages',              desc: 'Save selected pages as a new PDF file',             category: 'pdf',      icon: '📤', path: '/extract-pages',          badge: null,        tags: ['extract','save pages','select pages','subset'] },
  { id: 'deskew',           name: 'Deskew / Straighten PDF',    desc: 'Auto-correct skewed scan alignment',                category: 'pdf',      icon: '📏', path: '/deskew',                 badge: null,        tags: ['deskew','straighten','align','skew','tilt','scan fix'] },
  { id: 'rename',           name: 'Rename PDF',                 desc: 'Batch rename PDF files with custom patterns',       category: 'pdf',      icon: '🏷️', path: '/rename-pdf',             badge: null,        tags: ['rename','batch rename','file name','custom name'] },
  { id: 'repair',           name: 'Repair Corrupted PDF',       desc: 'Fix broken/corrupted PDFs that won\'t open',        category: 'pdf',      icon: '🔧', path: '/pdf-repair',             badge: null,        tags: ['repair','fix','corrupted','broken','damaged','recover'] },
  { id: 'pdf-stats',        name: 'PDF Stats Analyzer',         desc: 'View page count, size, metadata & structure info',  category: 'pdf',      icon: '📊', path: '/pdf-stats',              badge: null,        tags: ['stats','info','metadata','page count','analyze','inspect'] },
  { id: 'booklet',          name: 'Booklet Maker',              desc: 'Arrange pages for double-sided booklet printing',   category: 'pdf',      icon: '📚', path: '/booklet',                badge: null,        tags: ['booklet','saddle stitch','print','pamphlet','double sided'] },
  { id: 'increase-size',    name: 'Increase PDF File Size',     desc: 'Pad PDF to meet minimum size requirements',         category: 'pdf',      icon: '📈', path: '/increase-size',          badge: null,        tags: ['increase size','minimum size','pad pdf','bigger'] },
  { id: 'remove-annotations','name':'Remove Annotations',       desc: 'Strip all comments, highlights & sticky notes',     category: 'pdf',      icon: '🗑️', path: '/remove-annotations',     badge: null,        tags: ['remove annotations','comments','highlights','sticky notes','clean'] },
  { id: 'auto-crop',        name: 'Auto Crop Margins',          desc: 'Intelligently trim white margins from PDF pages',   category: 'pdf',      icon: '✂️', path: '/auto-crop-margins',      badge: null,        tags: ['auto crop','margins','trim','white space','crop'] },
  { id: 'alternate-mix',    name: 'Alternate Page Mix',         desc: 'Interleave front & back scans into one PDF',        category: 'pdf',      icon: '🔀', path: '/alternate-mix',          badge: null,        tags: ['alternate','interleave','front back','scanner','mix pages'] },
  { id: 'flip',             name: 'Flip PDF (Mirror)',          desc: 'Mirror flip pages horizontally or vertically',      category: 'pdf',      icon: '🪞', path: '/flip',                   badge: null,        tags: ['flip','mirror','horizontal','vertical','upside down'] },

  // 🔄 Converters
  { id: 'pdf-to-excel',     name: 'PDF to Excel (.xlsx)',       desc: 'Extract tables & spreadsheets to Excel rows',       category: 'convert',  icon: '📊', path: '/pdf-to-excel',           badge: 'Table AI',  tags: ['pdf to excel','xlsx','excel','table','spreadsheet','extract data'] },
  { id: 'pdf-to-ppt',       name: 'PDF to PowerPoint (.pptx)', desc: 'Turn PDF pages into editable slides',               category: 'convert',  icon: '📽️', path: '/pdf-to-ppt',             badge: null,        tags: ['pdf to ppt','pptx','powerpoint','presentation','slides'] },
  { id: 'universal',        name: 'Universal Converter',        desc: 'Convert between 30+ formats — Office, PDF, Images', category: 'convert',  icon: '🌐', path: '/universal-converter',    badge: 'All-in-One', tags: ['universal','convert','any format','word to pdf','excel to pdf','ppt to pdf'] },
  { id: 'jpg-to-pdf',       name: 'JPG / PNG to PDF',          desc: 'Convert images to crisp multi-page PDF',            category: 'convert',  icon: '🖼️', path: '/jpg-to-pdf',             badge: null,        tags: ['jpg to pdf','png to pdf','image to pdf','photo to pdf','pic to pdf'] },
  { id: 'webpage-to-pdf',   name: 'Webpage to PDF',            desc: 'Convert any website URL to paginated PDF',          category: 'convert',  icon: '🌍', path: '/webpage-to-pdf',         badge: null,        tags: ['webpage','website','url','html to pdf','web to pdf'] },
  { id: 'pdf-to-images',    name: 'PDF to Images (300 DPI)',    desc: 'Export pages as crystal clear JPG/PNG at 300 DPI',  category: 'convert',  icon: '🎨', path: '/pdf-to-jpg',             badge: '300 DPI',   tags: ['pdf to image','pdf to jpg','pdf to png','export pages','screenshot pdf'] },
  { id: 'office-to-pdf',    name: 'Word / Excel / PPT to PDF', desc: 'Convert Office documents to PDF perfectly',         category: 'convert',  icon: '💼', path: '/universal-converter',    badge: null,        tags: ['word to pdf','docx to pdf','excel to pdf','ppt to pdf','office'] },
  { id: 'pdf-to-markdown',  name: 'PDF to Markdown (.md)',      desc: 'Extract text as clean Markdown format',             category: 'convert',  icon: '📋', path: '/pdf-to-markdown',        badge: null,        tags: ['markdown','md','text extraction','pdf to text','developer'] },
  { id: 'extract-text',     name: 'Extract Text from PDF',      desc: 'Extract plain text content from any PDF',           category: 'convert',  icon: '📃', path: '/extract-text',           badge: null,        tags: ['extract text','plain text','copy text','text extraction','ocr'] },
  { id: 'ocr',              name: 'OCR — Make PDF Searchable',  desc: 'Add OCR text layer to scanned PDFs',                category: 'convert',  icon: '👁️', path: '/searchable-pdf',         badge: 'OCR',       tags: ['ocr','searchable','scan to text','recognize text','optical character'] },
  { id: 'searchable-pdf',   name: 'Searchable PDF (OCR)',       desc: 'Make scanned PDF fully text-searchable with OCR',   category: 'convert',  icon: '🔍', path: '/searchable-pdf',         badge: 'OCR',       tags: ['searchable pdf','ocr','scan text','search in pdf'] },
  { id: 'font-extractor',   name: 'Font Extractor',             desc: 'Extract & download fonts embedded inside PDFs',     category: 'convert',  icon: '🔤', path: '/font-extractor',         badge: null,        tags: ['font','extract font','embedded font','typeface','typography'] },
  { id: 'font-replacer',    name: 'Replace Font in PDF',        desc: 'Swap fonts across all pages of a PDF file',         category: 'convert',  icon: '🔡', path: '/font-replacer',          badge: null,        tags: ['font replace','change font','swap font','font substitution'] },
  { id: 'extract-tables',   name: 'Extract Tables from PDF',    desc: 'Pull table data out as CSV/Excel files',            category: 'convert',  icon: '📋', path: '/extract-tables',         badge: null,        tags: ['extract tables','csv','table extraction','data','spreadsheet'] },
  { id: 'extract-images',   name: 'Extract Images from PDF',    desc: 'Save all embedded images from PDF pages',           category: 'convert',  icon: '🖼️', path: '/extract-images',         badge: null,        tags: ['extract images','save images','embedded images','photos from pdf'] },
  { id: 'link-extractor',   name: 'Extract Links from PDF',     desc: 'Get all URLs and hyperlinks from a PDF document',   category: 'convert',  icon: '🔗', path: '/link-extractor',         badge: null,        tags: ['links','url','hyperlinks','extract links','anchor'] },
  { id: 'bates-numbering',  name: 'Bates Numbering',            desc: 'Add sequential legal Bates numbers to PDF pages',   category: 'convert',  icon: '⚖️', path: '/bates-numbering',        badge: 'Legal',     tags: ['bates','legal','numbering','sequential','court','law'] },
  { id: 'headers-footers',  name: 'Add Headers & Footers',      desc: 'Add custom text headers/footers across all pages',  category: 'convert',  icon: '📝', path: '/headers-footers',        badge: null,        tags: ['header','footer','running header','page text'] },
  { id: 'highlight-text',   name: 'Highlight Text in PDF',      desc: 'Auto-highlight keywords & phrases across pages',    category: 'convert',  icon: '🖊️', path: '/highlight-text',         badge: null,        tags: ['highlight','color','mark text','annotate','keyword'] },
  { id: 'long-image',       name: 'Long Image to PDF',          desc: 'Convert tall scrollable images to paginated PDF',   category: 'convert',  icon: '📜', path: '/long-image-to-pdf',      badge: null,        tags: ['long image','scroll screenshot','tall image','web screenshot','infographic'] },
  { id: 'code-to-pdf',      name: 'Code to PDF (Syntax)',       desc: 'Convert source code files to syntax-highlighted PDF',category: 'convert', icon: '💻', path: '/code-to-pdf',            badge: null,        tags: ['code','source code','syntax highlight','developer','programming'] },
  { id: 'pdf-to-audio',     name: 'PDF to Audio / MP3',         desc: 'Convert PDF text to speech audio MP3 file',         category: 'convert',  icon: '🔊', path: '/pdf-to-audio',           badge: null,        tags: ['audio','mp3','text to speech','tts','read aloud','listen'] },
  { id: 'talking-notes',    name: 'Talking Notes (Audio AI PDF)', desc: 'Listen to PDF documents with AI voice narration and chapter bookmarks', category: 'convert', icon: '🎙️', path: '/talking-notes', badge: 'AI Voice', tags: ['audio','talking notes','voice','listen','speech','mp3','audiobook'] },
  { id: 'target-compress-convert', name: 'Target Size PDF Compress', desc: 'Compress PDF under specific KB or MB limits (e.g. 100KB, 1MB)', category: 'convert', icon: '🎯', path: '/target-compress', badge: 'KB/MB', tags: ['target compress','exact size','kb','mb','compress to size'] },
  { id: 'video-to-pdf',     name: 'Video to PDF Frames',        desc: 'Extract frames from video as PDF slideshow',        category: 'convert',  icon: '🎬', path: '/video-to-pdf',           badge: null,        tags: ['video','frames','mp4','gif','screenshot frames'] },

  // 🖼️ Image Tools
  { id: 'image-resizer',    name: 'Image Resizer',              desc: 'Resize images to any dimensions in px/%',           category: 'image',    icon: '📐', path: '/image-resizer',          badge: null,        tags: ['resize image','image size','px','dimensions','scale','shrink'] },
  { id: 'remove-bg',        name: 'Remove Image Background',    desc: 'AI-powered background removal in seconds',          category: 'image',    icon: '✂️', path: '/remove-background',      badge: 'AI',        tags: ['remove background','bg remover','transparent','cutout','eraser'] },
  { id: 'image-crop',       name: 'Image Cropper',              desc: 'Crop images with aspect ratio & freehand controls', category: 'image',    icon: '🖼️', path: '/image-crop',             badge: null,        tags: ['crop','image crop','aspect ratio','freehand','trim image'] },
  { id: 'image-convert',    name: 'Image Format Converter',     desc: 'Convert between JPG, PNG, WebP, TIFF, AVIF',        category: 'image',    icon: '🎨', path: '/image-converter',        badge: null,        tags: ['image convert','jpg png','webp','tiff','avif','format'] },
  { id: 'pixel-resizer',    name: 'Exact Pixel Resizer',        desc: 'Resize to exact target file size in KB/MB',         category: 'image',    icon: '🎯', path: '/pixel-resizer',          badge: null,        tags: ['pixel resizer','exact size','kb resizer','compress image'] },
  { id: 'image-watermark',  name: 'Image Watermark',            desc: 'Add text or logo watermark to images',              category: 'image',    icon: '💧', path: '/image-watermark',        badge: null,        tags: ['image watermark','logo','brand','text on image'] },
  { id: 'image-text-editor','name':'Image Text Editor',         desc: 'Add text, draw shapes & stickers on images',        category: 'image',    icon: '✏️', path: '/image-text-editor',      badge: null,        tags: ['image editor','text on image','draw','sticker','caption'] },
  { id: 'passport-sheet',   name: 'Passport Photo 4x6 Sheet',  desc: 'Make printable passport photo sheet with dress change',category:'image',   icon: '👔', path: '/passport-photo-sheet',   badge: 'Print',     tags: ['passport','photo sheet','4x6','a4','print photos','id photo'] },
  { id: 'exact-image-size', name: 'Exact Image Size (KB)',      desc: 'Compress image to exact KB for govt form uploads',   category: 'image',    icon: '📏', path: '/exact-image-size',       badge: null,        tags: ['exact size','kb','image compress','government upload','file size'] },
  { id: 'grayscale',        name: 'Grayscale PDF / Image',      desc: 'Convert full-color PDF or image to grayscale',      category: 'image',    icon: '⚫', path: '/grayscale-pdf',          badge: null,        tags: ['grayscale','black white','monochrome','grey','desaturate'] },
  { id: 'invert-colors',    name: 'Invert PDF Colors',          desc: 'Invert / negative colors for dark mode printing',   category: 'image',    icon: '🌑', path: '/invert-colors',          badge: null,        tags: ['invert','negative','dark mode','contrast','colors'] },
  { id: 'ink-saver',        name: 'Ink Saver Mode',             desc: 'Reduce ink usage for economical document printing', category: 'image',    icon: '🖨️', path: '/ink-saver',              badge: null,        tags: ['ink saver','print','save ink','toner','light print'] },
  { id: 'color-correction', name: 'Image Color Correction',     desc: 'Adjust brightness, contrast, saturation & hue',    category: 'image',    icon: '🌈', path: '/image-color-correction', badge: null,        tags: ['color correction','brightness','contrast','saturation','hue','adjust'] },
  { id: 'noise-reduction',  name: 'Image Noise Reduction',      desc: 'Denoise and sharpen photos & scanned documents',    category: 'image',    icon: '🔆', path: '/image-noise-reduction',  badge: null,        tags: ['noise','denoise','sharpen','blur','clean image','photo enhance'] },
  { id: 'cmyk',             name: 'CMYK Color Converter',       desc: 'Convert PDF to CMYK for professional print shops',  category: 'image',    icon: '🖨️', path: '/cmyk-converter',         badge: 'Print',     tags: ['cmyk','print','color profile','offset printing','press'] },
  { id: 'color-extractor',  name: 'Color Extractor / Palette',  desc: 'Extract dominant colors from any image or PDF',     category: 'image',    icon: '🎨', path: '/color-extractor',        badge: null,        tags: ['color palette','dominant color','hex','extract color','design'] },
  { id: 'image-base64',     name: 'Image to Base64',            desc: 'Convert image to Base64 string for web embedding',  category: 'image',    icon: '💾', path: '/image-to-base64',        badge: null,        tags: ['base64','data uri','encode image','web embed','developer'] },
  { id: 'image-metadata',   name: 'Image Metadata Viewer',      desc: 'View EXIF, GPS, camera settings & creation date',   category: 'image',    icon: '🗂️', path: '/image-metadata',         badge: null,        tags: ['exif','metadata','gps','camera info','image info','properties'] },
  { id: 'image-collage',    name: 'Image Collage Maker',        desc: 'Create beautiful multi-image collage layouts',      category: 'image',    icon: '🖼️', path: '/image-collage',          badge: null,        tags: ['collage','grid','photo grid','layout','combine images'] },
  { id: 'screenshot-to-pdf','name':'Screenshot to PDF',         desc: 'Convert browser screenshots to clean PDF files',    category: 'image',    icon: '📸', path: '/screenshot-to-pdf',      badge: null,        tags: ['screenshot','png to pdf','image to pdf','screen capture'] },
  { id: 'convert-webp',     name: 'WebP Converter',             desc: 'Convert WebP to JPG/PNG or any image to WebP',      category: 'image',    icon: '🌐', path: '/convert-webp',           badge: null,        tags: ['webp','convert webp','jpg','png','image format'] },
  { id: 'convert-tiff',     name: 'TIFF Converter',             desc: 'Convert TIFF images to JPG/PNG/PDF formats',        category: 'image',    icon: '🖼️', path: '/convert-tiff',           badge: null,        tags: ['tiff','tif','convert','fax','print quality'] },
  { id: 'qr-code',          name: 'QR Code Generator',          desc: 'Create and download QR codes for any URL or text',  category: 'image',    icon: '📱', path: '/qr-code',                badge: null,        tags: ['qr code','barcode','generate qr','scan','link'] },
  { id: 'smart-img-pdf',    name: 'Smart Image to PDF',         desc: 'Auto-detect orientation & convert to optimized PDF',category: 'image',    icon: '🤖', path: '/smart-image-to-pdf',     badge: 'AI',        tags: ['smart','auto','image to pdf','detect orientation','optimize'] },

  // 🇮🇳 Sarkari / Govt KYC Tools
  { id: 'sarkari-photo-tab',name: 'Sarkari Photo & Sign Maker', desc: 'Resize photo & signature to 20–50 KB govt recruitment format', category: 'sarkari', icon: '🇮🇳', path: '/sarkari-photo-signature', badge: 'Govt KYC', tags: ['sarkari','photo','signature','sign','20kb','50kb','government','recruitment','form'] },
  { id: 'passport-sheet-sarkari', name: 'Passport Photo 4x6 Sheet', desc: 'Create 8/16/32 passport photos with dress change on 4x6/A4 sheet', category: 'sarkari', icon: '👔', path: '/passport-photo-sheet', badge: 'Print', tags: ['passport photo','photo sheet','4x6','a4','dress change','print photo','id photo'] },
  { id: 'clean-signature-sarkari', name: 'Clean Paper Signature', desc: 'Phone photo to transparent PNG or 10-20KB pure white JPG sign', category: 'sarkari', icon: '✍️', path: '/clean-signature', badge: 'Pure Ink', tags: ['signature','clean signature','transparent','white background','paper sign','crop signature','20kb'] },
  { id: 'smart-kyc-sarkari', name: 'Smart KYC Slip Maker',      desc: 'Combine Aadhaar + PAN + Bank passbook on 1 verified KYC slip', category: 'sarkari', icon: '📋', path: '/smart-kyc-slip', badge: 'KYC AI', tags: ['kyc','smart kyc','aadhaar','pan','bank passbook','account opening','csc','emitra'] },
  { id: 'admit-card-sarkari', name: 'Admit Card & Roll No. Optimizer', desc: 'Auto-crop roll number slip & enhance contrast for 1-page print', category: 'sarkari', icon: '🎟️', path: '/admit-card-optimizer', badge: 'Exam Slip', tags: ['admit card','hall ticket','roll number','crop admit card','ssc admit card','upsc hall ticket','clean print'] },
  { id: 'masked-aadhaar',   name: 'Masked Aadhaar Maker',       desc: 'Mask first 8 digits (XXXX-XXXX-1234) per UIDAI/RBI', category: 'sarkari', icon: '🛡️', path: '/masked-aadhaar',         badge: 'RBI KYC',   tags: ['masked aadhaar','uidai','rbi','kyc','aadhaar','mask'] },
  { id: 'id-joiner',        name: 'ID Card Front & Back Joiner', desc: 'Combine Aadhaar/Voter ID front & back on one page', category: 'sarkari', icon: '💳', path: '/id-card-joiner',         badge: null,        tags: ['id card','aadhaar','voter id','front back','join','kyc'] },
  { id: 'self-attest-sarkari', name: 'Self-Attestation Generator', desc: 'Add digital self-attested signature stamp & date for govt uploads', category: 'sarkari', icon: '🖋️', path: '/self-attest', badge: 'Self Attest', tags: ['self attest','self attestation','signature stamp','verified copy','govt upload'] },
  { id: 'exam-merger',      name: 'Exam Document Merger',       desc: 'Merge admit card, marksheet & ID into one PDF',     category: 'sarkari', icon: '🎓', path: '/exam-document-merger',   badge: null,        tags: ['exam','admit card','marksheet','merge documents','sarkari','government'] },
  { id: 'pdf-form-filler',  name: 'PDF Form Filler',            desc: 'Fill fillable PDF forms directly in browser',       category: 'sarkari', icon: '📝', path: '/pdf-form-filler',        badge: null,        tags: ['form','fill form','pdf form','interactive','fillable'] },
  { id: 'pdf-to-audio-2',   name: 'PDF to Audio (Hindi/EN)',    desc: 'Listen to government PDFs in Hindi or English',     category: 'sarkari', icon: '🔊', path: '/pdf-to-audio',           badge: 'Hindi',     tags: ['audio','hindi','read aloud','listen pdf','tts','regional language'] },

  // 🔒 Security & Privacy Tools
  { id: 'protect',          name: 'Protect PDF (Password)',     desc: 'Encrypt PDF with AES-256 password protection',      category: 'security', icon: '🔒', path: '/protect',                badge: 'AES-256',   tags: ['protect','password','encrypt','secure','lock pdf'] },
  { id: 'remove-metadata',  name: 'Remove PDF Metadata',       desc: 'Scrub author names, GPS, device info & tracking',   category: 'security', icon: '🧹', path: '/remove-metadata',        badge: 'Privacy',   tags: ['metadata','remove metadata','author','gps','privacy','scrub','anonymous'] },
  { id: 'validate-sig',     name: 'Validate Digital Signatures', desc: 'Inspect PDF signature dictionaries & SHA-256',     category: 'security', icon: '🔍', path: '/validate-signatures',    badge: null,        tags: ['digital signature','validate','verify','sha256','sign','certificate'] },
  { id: 'pdf-sanitizer',    name: 'PDF Sanitizer',             desc: 'Remove embedded JS, macros & malicious actions',    category: 'security', icon: '🧼', path: '/pdf-sanitizer',          badge: 'Safe',      tags: ['sanitize','javascript','macros','malware','security','safe'] },
  { id: 'redact-security',  name: 'Redact Sensitive Info',     desc: 'Permanently blackout PII from documents',           category: 'security', icon: '⬛', path: '/redact',                  badge: 'Auto PII',  tags: ['redact','pii','sensitive','aadhaar','pan','email','blackout','censor'] },
  { id: 'invisible-watermark','name':'Invisible Watermark',     desc: 'Embed hidden ownership watermark undetectable to eye',category:'security', icon: '👁️', path: '/invisible-watermark',   badge: 'Steganography',tags:['invisible watermark','hidden','steganography','ownership','proof'] },
  { id: 'self-destruct',    name: 'Self-Destruct PDF',         desc: 'Create PDF that auto-deletes after N views/hours',  category: 'security', icon: '💥', path: '/self-destruct',          badge: null,        tags: ['self destruct','expire','one time','auto delete','time limit'] },
  { id: 'certify',          name: 'Certify Document',          desc: 'Add certification seal & digital authority stamp',  category: 'security', icon: '🏛️', path: '/certify-document',       badge: 'Legal',     tags: ['certify','seal','certificate','authority','notary','official'] },
  { id: 'batch-protect',    name: 'Batch Protect PDFs',        desc: 'Password-protect multiple PDFs simultaneously',     category: 'security', icon: '🔐', path: '/batch-protect',          badge: null,        tags: ['batch','multiple','protect','password','bulk'] },
  { id: 'accessibility',    name: 'Accessibility Checker',     desc: 'Check PDF for WCAG/PDF-UA accessibility compliance',category: 'security', icon: '♿', path: '/accessibility-checker',  badge: 'WCAG',      tags: ['accessibility','wcag','pdf-ua','compliance','screen reader','ada'] },
  { id: 'pdf-a',            name: 'PDF/A Conversion',          desc: 'Convert to archival PDF/A-1b for long-term storage', category: 'security', icon: '🗄️', path: '/pdf-a-conversion',       badge: 'Archive',   tags: ['pdf/a','archive','long term','iso','compliance','pdfa'] },
  { id: 'file-hash',        name: 'File Hash Generator',       desc: 'Get MD5, SHA-1, SHA-256 hash of any file',          category: 'security', icon: '🔐', path: '/file-hash',              badge: null,        tags: ['hash','md5','sha256','sha1','checksum','verify','integrity'] },
  { id: 'password-check',   name: 'Password Strength Checker', desc: 'Test password strength with entropy analysis',      category: 'security', icon: '💪', path: '/password-strength',      badge: null,        tags: ['password','strength','entropy','security check','weak strong'] },
  { id: 'remove-drm',       name: 'Add DRM Protection',        desc: 'Add digital rights management restrictions to PDF',  category: 'security', icon: '🛡️', path: '/add-drm',               badge: 'DRM',       tags: ['drm','rights management','copy protection','print restrict','permission'] },
  { id: 'crypto-sign',      name: 'Crypto Sign (PKI)',         desc: 'Sign documents with RSA/ECDSA cryptographic keys',  category: 'security', icon: '🔏', path: '/crypto-sign',            badge: 'PKI',       tags: ['crypto','sign','rsa','ecdsa','pki','digital sign','key'] },
];

// ─── STATE ────────────────────────────────────────────────────────────────
let currentCategory = 'popular';
let searchQuery = '';
let recentFiles = [];
let showingRecent = false;

// ─── DOM REFS ─────────────────────────────────────────────────────────────
const searchInput       = document.getElementById('tool-search');
const clearSearchBtn    = document.getElementById('clear-search');
const tabs              = document.querySelectorAll('.tab-btn');
const toolsContainer    = document.getElementById('tools-list');
const quickDropzone     = document.getElementById('quick-dropzone');
const dropFileInput     = document.getElementById('drop-file-input');
const pdfBanner         = document.getElementById('pdf-detected-banner');
const pdfBannerFile     = document.getElementById('pdf-banner-filename');
const recentPanel       = document.getElementById('recent-panel');
const recentList        = document.getElementById('recent-list');
const btnHistory        = document.getElementById('btn-history');
const clearRecentBtn    = document.getElementById('clear-recent');
const bannerCompress    = document.getElementById('banner-compress');
const bannerConvert     = document.getElementById('banner-convert');
const bannerAll         = document.getElementById('banner-all');

// ─── INIT ─────────────────────────────────────────────────────────────────
async function init() {
  await Promise.all([
    checkCurrentTabForPdf(),
    loadRecentFiles(),
  ]);
  // Small delay to show skeleton, then render
  setTimeout(renderTools, 100);
}

// ─── PDF TAB DETECTION ────────────────────────────────────────────────────
function checkCurrentTabForPdf() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_INFO' }, (response) => {
      if (response && response.isPdf) {
        pdfBanner.style.display = 'flex';
        const title = response.title || response.url || 'PDF file is open in this tab';
        const shortName = title.length > 35 ? title.substring(0, 35) + '...' : title;
        pdfBannerFile.textContent = shortName;

        // Banner action buttons
        bannerCompress.addEventListener('click', () => {
          chrome.tabs.create({ url: `${BASE_URL}/compress?utm_source=extension_pdf_banner` });
        });
        bannerConvert.addEventListener('click', () => {
          chrome.tabs.create({ url: `${BASE_URL}/pdf-to-word?utm_source=extension_pdf_banner` });
        });
        bannerAll.addEventListener('click', () => {
          chrome.tabs.create({ url: `${BASE_URL}/all-tools?utm_source=extension_pdf_banner` });
        });
      }
      resolve();
    });
  });
}

// ─── RECENT FILES ─────────────────────────────────────────────────────────
function loadRecentFiles() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_RECENT_FILES' }, (response) => {
      recentFiles = (response && response.recentFiles) || [];
      resolve();
    });
  });
}

function addToRecent(tool) {
  const entry = {
    name: tool.name,
    path: tool.path,
    icon: tool.icon,
    ts: Date.now(),
  };
  chrome.runtime.sendMessage({ type: 'ADD_RECENT_FILE', file: entry });
  // Update local copy too
  recentFiles = [entry, ...recentFiles.filter((f) => f.path !== entry.path)].slice(0, 8);
}

function renderRecentPanel() {
  if (recentFiles.length === 0) {
    recentList.innerHTML = '<div class="recent-empty">No recent tools yet. Use any tool to track history.</div>';
    return;
  }
  recentList.innerHTML = recentFiles
    .map(
      (f) => `
      <div class="recent-item" data-path="${escapeHtml(f.path)}">
        <span class="recent-icon">${escapeHtml(f.icon)}</span>
        <span class="recent-name">${escapeHtml(f.name)}</span>
        <span class="recent-arrow">→</span>
      </div>`
    )
    .join('');

  recentList.querySelectorAll('.recent-item').forEach((el) => {
    el.addEventListener('click', () => {
      const path = el.getAttribute('data-path');
      chrome.tabs.create({ url: `${BASE_URL}${path}?utm_source=extension_recent` });
    });
  });
}

// ─── TOOL RENDER ──────────────────────────────────────────────────────────
function renderTools() {
  const query = searchQuery.toLowerCase().trim();

  const filtered = TOOLS_CATALOG.filter((tool) => {
    if (query) {
      return (
        tool.name.toLowerCase().includes(query) ||
        tool.desc.toLowerCase().includes(query) ||
        tool.category.toLowerCase().includes(query) ||
        (tool.tags && tool.tags.some((tag) => tag.includes(query)))
      );
    }
    if (currentCategory === 'all') return true;
    if (currentCategory === 'popular') return tool.category === 'popular';
    return tool.category === currentCategory;
  });

  // Remove duplicates (some tools appear in multiple categories)
  const seen = new Set();
  const unique = filtered.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  if (unique.length === 0) {
    toolsContainer.innerHTML = `
      <div class="no-results">
        <div style="font-size:28px;margin-bottom:8px;">🔍</div>
        <p>No tools matched "<strong>${escapeHtml(query)}</strong>"</p>
        <p style="margin-top: 8px; font-size: 11px;">
          <a href="${BASE_URL}/all-tools?utm_source=extension_search_miss" target="_blank" style="color: var(--brand-red);">
            Browse all 110+ tools on website →
          </a>
        </p>
      </div>
    `;
    return;
  }

  toolsContainer.innerHTML = unique
    .map(
      (tool) => `
    <div class="tool-item" data-path="${escapeHtml(tool.path)}" data-id="${escapeHtml(tool.id)}" role="button" tabindex="0" title="${escapeHtml(tool.desc)}">
      <div class="tool-left">
        <span class="tool-emoji">${escapeHtml(tool.icon)}</span>
        <div class="tool-details">
          <span class="tool-name">${escapeHtml(tool.name)}</span>
          <span class="tool-desc">${escapeHtml(tool.desc)}</span>
        </div>
      </div>
      ${tool.badge ? `<span class="tool-badge">${escapeHtml(tool.badge)}</span>` : '<span class="tool-arrow">→</span>'}
    </div>
  `
    )
    .join('');

  // Add click + keyboard listeners
  toolsContainer.querySelectorAll('.tool-item').forEach((el) => {
    const handleOpen = () => {
      const path = el.getAttribute('data-path');
      const id = el.getAttribute('data-id');
      const tool = TOOLS_CATALOG.find((t) => t.id === id);
      if (tool) addToRecent(tool);
      chrome.tabs.create({ url: `${BASE_URL}${path}?utm_source=extension_popup` });
    };
    el.addEventListener('click', handleOpen);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleOpen(); });
  });

  // Animate items in
  requestAnimationFrame(() => {
    toolsContainer.querySelectorAll('.tool-item').forEach((el, i) => {
      el.style.animationDelay = `${i * 25}ms`;
      el.classList.add('tool-item-animate');
    });
  });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────

// Search
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
  if (showingRecent) { toggleRecent(false); }
  renderTools();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  clearSearchBtn.style.display = 'none';
  searchInput.focus();
  renderTools();
});

// Keyboard shortcut: Escape clears search
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    renderTools();
  }
});

// Category Tabs
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    currentCategory = tab.getAttribute('data-category');
    if (searchQuery) {
      searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.style.display = 'none';
    }
    if (showingRecent) toggleRecent(false);
    renderTools();
  });
});

// History / Recent Panel Toggle
function toggleRecent(forceState) {
  showingRecent = forceState !== undefined ? forceState : !showingRecent;
  if (showingRecent) {
    renderRecentPanel();
    recentPanel.style.display = 'block';
    toolsContainer.style.display = 'none';
    btnHistory.classList.add('active');
  } else {
    recentPanel.style.display = 'none';
    toolsContainer.style.display = 'grid';
    btnHistory.classList.remove('active');
    renderTools();
  }
}

btnHistory.addEventListener('click', () => toggleRecent());

clearRecentBtn.addEventListener('click', () => {
  recentFiles = [];
  chrome.runtime.sendMessage({ type: 'CLEAR_RECENT_FILES' });
  renderRecentPanel();
});

// Dropzone — Smart file-type detection
quickDropzone.addEventListener('click', () => dropFileInput.click());

function handleFileDrop(file) {
  if (!file) return;
  const name = file.name.toLowerCase();
  let path = '/compress'; // default for PDFs

  if (name.endsWith('.pdf')) {
    path = '/compress';
  } else if (name.match(/\.(jpg|jpeg|png|webp|bmp|tiff|gif)$/)) {
    path = '/jpg-to-pdf';
  } else if (name.match(/\.(doc|docx)$/)) {
    path = '/universal-converter';
  } else if (name.match(/\.(xls|xlsx)$/)) {
    path = '/universal-converter';
  } else if (name.match(/\.(ppt|pptx)$/)) {
    path = '/universal-converter';
  }

  chrome.tabs.create({
    url: `${BASE_URL}${path}?utm_source=extension_dropzone`,
  });
}

dropFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) handleFileDrop(e.target.files[0]);
});

quickDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  quickDropzone.classList.add('drag-active');
});

quickDropzone.addEventListener('dragleave', () => {
  quickDropzone.classList.remove('drag-active');
});

quickDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  quickDropzone.classList.remove('drag-active');
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleFileDrop(e.dataTransfer.files[0]);
  }
});

// ─── START ────────────────────────────────────────────────────────────────
init();
