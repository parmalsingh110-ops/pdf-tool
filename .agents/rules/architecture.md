---
trigger: always_on
description: "Automatically provides the codebase graph, folder structure, and API connections for the pdf-tool project to Antigravity."
---

# PDF-Tool Codebase Architecture & Graph

This document serves as the "Graph" context for the `pdf-tool` project, giving AI agents an instant understanding of the project's structure, files, and API connections without needing to scan the whole repository.

## Project Structure Overview

- **`backend/`**: Contains the Python backend (FastAPI/Flask).
  - `main.py`: The core backend file containing all API routes and logic.
  - `requirements.txt`: Python dependencies.
- **`src/`**: Contains the React + TypeScript frontend.
  - **`pages/`**: Contains 110 page components (e.g., AdvancedEditor.tsx, AllTools.tsx).
  - **`components/`**: Contains shared UI components (e.g., Layout.tsx, FileDropzone.tsx).
- **`public/`**: Static assets.

## Backend Routes Overview

The backend exposes the following API routes found in `backend/main.py`:

```markdown
- [GET] /
- [POST] /analyze/links
- [POST] /compress-pdf
- [POST] /convert/auto-crop
- [POST] /convert/cmyk
- [POST] /convert/excel-to-ppt
- [POST] /convert/excel-to-word
- [POST] /convert/make-searchable
- [POST] /convert/office-to-pdf
- [POST] /convert/pdf-to-excel
- [POST] /convert/pdf-to-ppt
- [POST] /convert/pdf-to-word
- [POST] /convert/pdf-to-word-plaintext
- [POST] /convert/ppt-to-excel
- [POST] /convert/ppt-to-word
- [POST] /convert/replace-font
- [POST] /convert/webpage-to-pdf
- [POST] /convert/word-to-ppt
- [POST] /edit-pdf
- [POST] /extract-images
- [POST] /extract-tables
- [POST] /ocr/analyze
- [POST] /repair-pdf
- [POST] /search-replace
```

## Frontend to Backend Connections

This section maps which frontend components interact with which API endpoints or internal paths:

```markdown
- **AddDrm.tsx** calls: /protect
- **AdvancedEditor.tsx** calls: /fonts/NotoSansDevanagari-Regular.ttf, /fonts/NotoSansDevanagari-Bold.ttf
- **AllTools.tsx** calls: /merge, /split, /compress, /increase-size, /pdf-to-jpg, /jpg-to-pdf, /organize, /protect, /unlock, /watermark, /page-numbers, /edit, /target-compress, /exact-image-size, /pixel-resizer, /image-resizer, /image-text-editor, /searchable-pdf, /extract-text, /edit-metadata, /flatten-pdf, /reverse, /add-margins, /pdf-sanitizer, /pdf-repair, /auto-crop-margins, /long-image-to-pdf, /n-up-layout, /search-replace, /pdf-to-word, /pdf-to-excel, /pdf-to-ppt, /extract-tables, /font-extractor, /bates-numbering, /headers-footers, /remove-text, /highlight-text, /pdf-to-markdown, /font-replacer, /link-extractor, /extract-images, /pdf-to-gif, /video-to-pdf, /remove-background, /passport-photo-sheet, /convert-webp, /convert-tiff, /universal-converter, /word-to-pdf-exact, /code-to-pdf, /extract-media, /grayscale-pdf, /invert-colors, /ink-saver, /image-color-correction, /image-noise-reduction, /cmyk-converter, /webpage-to-pdf, /pdf-to-audio, /image-collage, /qr-code, /signature-pad, /document-scanner, /pdf-comparison, /smart-image-to-pdf, /pdf-form-filler, /pdf-page-cropper, /image-insert, /reading-tracker, /crypto-sign, /validate-signatures, /pdf-a-conversion, /remove-metadata, /add-drm, /invisible-watermark, /self-destruct, /certify-document, /password-strength, /batch-protect, /accessibility-checker, /pdf-stats, /extract-pages, /booklet, /duplicate-pages, /rotate-pages, /redact, /image-converter, /image-watermark, /image-crop, /image-metadata, /screenshot-to-pdf, /page-counter, /stamp, /remove-blank-pages, /pdf-to-images, /image-to-base64, /pdf-overlay, /color-extractor, /present, /file-hash
- **CertifyDocument.tsx** calls: /> {certFile.name}</span>
                  ) : (
                    <span className=, /> Browse Certificate</span>
                  )}
                </label>
              </div>
            </div>

            <div>
              <label className=
- **CodeToPdf.tsx** calls: /*, //
- **CompressPDF.tsx** calls: /target-compress
- **CryptographicSignatures.tsx** calls: /edit
- **DocumentScanner.tsx** calls: /> Save All PDF
            </button>
          )}
        </div>

        <div className=, /> : <Crop className=, />} Align & Process
                      </button>
                    </div>
                  </div>
                )}
                
                {step === , /> Rotate 90°
                        </button>
                      </div>
                      
                      <button onClick={downloadCurrentAsJpg} className=
- **ExtractMedia.tsx** calls: /extract-images
- **Home.tsx** calls: /merge, /split, /compress, /edit, /protect, /unlock, /watermark, /page-numbers, /organize, /rotate-pages, /pdf-to-word, /pdf-to-excel, /pdf-to-ppt, /pdf-to-jpg, /jpg-to-pdf, /pdf-to-images, /screenshot-to-pdf, /searchable-pdf, /universal-converter, /image-resizer, /image-crop, /pixel-resizer, /image-converter, /remove-background, /image-watermark, /image-text-editor, /passport-photo-sheet, /exact-image-size, /color-extractor, /redact, /stamp, /pdf-stats, /booklet, /present, /extract-pages, /remove-blank-pages, /duplicate-pages, /pdf-overlay, /file-hash, /increase-size, /target-compress, /ink-saver, /grayscale-pdf, /image-to-base64, /image-metadata, /remove-metadata, /flatten-pdf, /all-tools
- **ImageCrop.tsx** calls: /><div className=, /></div>
            </div>
          </div>
          <div className=
- **InvisibleWatermark.tsx** calls: /watermark
- **KeyboardShortcutsModal.tsx** calls: /all-tools, /edit, /merge, /split, /compress, /target-compress, /image-resizer, /image-text-editor, /protect, /universal-converter, /privacy
- **Layout.tsx** calls: /merge, /split, /compress, /target-compress, /edit, /image-resizer, /pixel-resizer, /exact-image-size, /image-text-editor, /searchable-pdf, /remove-background, /passport-photo-sheet, /convert-webp, /convert-tiff, /all-tools, /privacy, /code-to-pdf, /organize, /watermark, /protect, /page-numbers, /rotate-pages, /reverse, /pdf-to-word, /pdf-to-excel, /pdf-to-ppt, /pdf-to-jpg, /jpg-to-pdf, /pdf-to-images, /universal-converter, /screenshot-to-pdf, /image-crop, /image-converter, /image-watermark, /color-extractor, /image-to-base64, /redact, /stamp, /pdf-stats, /booklet, /present, /remove-blank-pages, /duplicate-pages, /extract-pages, /file-hash
- **PdfAConversion.tsx** calls: /flatten-pdf, /remove-metadata
- **PdfSanitizer.tsx** calls: /Link
- **SelfDestruct.tsx** calls: /protect
- **UniversalConverter.tsx** calls: /g, , /convert/pdf-to-word, /convert/pdf-to-excel, /convert/pdf-to-ppt, /convert/office-to-pdf, /convert/word-to-ppt, /convert/excel-to-word, /convert/excel-to-ppt, /convert/ppt-to-word, /convert/ppt-to-excel
```

## How to use this Graph

As an AI agent, you now know the entire project structure. If a user asks to modify a feature, check the Frontend-to-Backend Connections to determine which React component in `src/pages` and which backend route in `backend/main.py` needs to be edited.
