#!/usr/bin/env python3
"""
Generate Chrome Web Store assets:
- Store Icon 128x128 (no alpha)
- Screenshots: 1280x800 (no alpha, 24-bit RGB PNG)
- Small Promo Tile: 440x280
- Marquee Promo Tile: 1400x560
"""

import os
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = os.path.abspath("extension/store-assets")
os.makedirs(OUT_DIR, exist_ok=True)

FONT_PATH = "/System/Library/Fonts/Helvetica.ttc"

def get_font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()

def draw_rounded_rect(draw, bbox, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(bbox, radius=radius, fill=fill, outline=outline, width=width)

# ─── SCREENSHOT 1: Toolbar Hub (1280 x 800) ──────────────────────────────────
def make_screenshot_1():
    img = Image.new("RGB", (1280, 800), color="#090d16")
    draw = ImageDraw.Draw(img)

    # Decorative background glows
    draw.ellipse([800, -100, 1400, 500], fill="#1c1124")
    draw.ellipse([-200, 400, 500, 1100], fill="#1a111a")

    # Header text
    f_badge = get_font(18)
    f_title = get_font(42)
    f_sub = get_font(22)
    f_tool = get_font(18)
    f_desc = get_font(14)
    f_small = get_font(13)

    # Top Pill
    draw_rounded_rect(draw, [80, 55, 340, 88], 16, fill="#2a1215", outline="#dc2626", width=1)
    draw.text((100, 62), "⚡ 110+ FREE TOOLS IN 1-CLICK", font=f_badge, fill="#f87171")

    # Headline
    draw.text((80, 105), "PDF Media Suite — Browser Hub", font=f_title, fill="#ffffff")
    draw.text((80, 165), "Compress, merge, convert, scan & edit without leaving your tab.", font=f_sub, fill="#94a3b8")

    # Left Feature Highlights
    features = [
        ("🚀 Instant Quick Launch", "Access all 110+ PDF & Image tools directly from the Chrome toolbar."),
        ("⚡ Real-Time Instant Search", "Search by keyword: 20kb, aadhaar, ocr, word, merge, split, cmyk."),
        ("🔒 100% Client-Side Privacy", "Files stay on your machine. Zero server upload for core tools."),
        ("🇮🇳 Sarkari Photo & Signature", "Exact 20–50 KB sizing for govt recruitment & KYC portal forms."),
    ]
    fy = 240
    for title, desc in features:
        draw_rounded_rect(draw, [80, fy, 680, fy + 80], 14, fill="#131b2e", outline="#1e293b", width=1)
        draw.text((105, fy + 16), title, font=f_tool, fill="#f8fafc")
        draw.text((105, fy + 44), desc, font=f_desc, fill="#94a3b8")
        fy += 98

    # Right Side: Simulated Extension Popup (400 x 580)
    px, py, pw, ph = 740, 95, 460, 630
    draw_rounded_rect(draw, [px, py, px + pw, py + ph], 20, fill="#0f172a", outline="#334155", width=2)

    # Popup Header
    draw_rounded_rect(draw, [px, py, px + pw, py + 65], 20, fill="#1e293b")
    draw.rectangle([px, py + 45, px + pw, py + 65], fill="#1e293b")
    # Red logo circle
    draw_rounded_rect(draw, [px + 20, py + 14, px + 58, py + 52], 10, fill="#ef4444")
    draw.text((px + 28, py + 20), "PDF", font=get_font(14), fill="#ffffff")
    draw.text((px + 72, py + 16), "PDF Media Suite", font=get_font(18), fill="#f8fafc")
    draw.text((px + 72, py + 38), "110+ Free Tools • v2.0", font=f_small, fill="#ef4444")

    # Search Bar
    draw_rounded_rect(draw, [px + 20, py + 80, px + pw - 20, py + 120], 10, fill="#1e293b", outline="#334155")
    draw.text((px + 36, py + 92), "🔍 Search 110+ tools (e.g. compress, word, sarkari)...", font=f_desc, fill="#64748b")

    # Category Pills
    categories = ["⭐ Popular", "📄 PDF", "🔄 Convert", "🖼️ Image", "🇮🇳 Sarkari"]
    cx = px + 20
    for cat in categories:
        cw = len(cat) * 9 + 16
        is_active = (cat == "⭐ Popular")
        fill_col = "#ef4444" if is_active else "#1e293b"
        text_col = "#ffffff" if is_active else "#94a3b8"
        draw_rounded_rect(draw, [cx, py + 132, cx + cw, py + 162], 15, fill=fill_col)
        draw.text((cx + 10, py + 138), cat, font=f_small, fill=text_col)
        cx += cw + 6

    # Dropzone
    draw_rounded_rect(draw, [px + 20, py + 175, px + pw - 20, py + 230], 12, fill="#172033", outline="#dc2626")
    draw.text((px + 40, py + 188), "📥 Drop PDF or Image Here to Quick Launch", font=f_desc, fill="#f87171")
    draw.text((px + 40, py + 208), "Instant 1-click compress, merge or convert", font=f_small, fill="#94a3b8")

    # Tool items inside popup
    sample_tools = [
        ("⚡", "Compress PDF", "Reduce size to exact target KB/MB", "HOT"),
        ("📑", "Merge PDF Files", "Combine multiple PDFs in custom order", "POPULAR"),
        ("📝", "PDF to Word (.docx)", "Convert PDF to editable Word document", "BEST"),
        ("🇮🇳", "Sarkari Photo & Sign", "Auto resize to 20-50 KB for govt portals", "GOVT KYC"),
        ("🔓", "Unlock Protected PDF", "Lossless removal of passwords & restrictions", "LOSSLESS"),
        ("📷", "Smart Document Scanner", "Scan & perspective warp with edge crop", "SOBEL AI"),
    ]
    ty = py + 245
    for icon, name, desc, badge in sample_tools:
        draw_rounded_rect(draw, [px + 20, ty, px + pw - 20, ty + 54], 10, fill="#1e293b", outline="#334155")
        draw.text((px + 32, ty + 16), icon, font=get_font(20), fill="#ffffff")
        draw.text((px + 65, ty + 12), name, font=get_font(15), fill="#f8fafc")
        draw.text((px + 65, ty + 32), desc, font=get_font(12), fill="#94a3b8")
        # Badge
        draw_rounded_rect(draw, [px + pw - 88, ty + 18, px + pw - 30, ty + 38], 6, fill="#2a1215")
        draw.text((px + pw - 82, ty + 22), badge, font=get_font(9), fill="#ef4444")
        ty += 60

    img.save(os.path.join(OUT_DIR, "screenshot-1.png"), format="PNG")
    print("✓ screenshot-1.png generated (1280x800)")

# ─── SCREENSHOT 2: Google Search Quick Widget (1280 x 800) ───────────────────
def make_screenshot_2():
    img = Image.new("RGB", (1280, 800), color="#ffffff")
    draw = ImageDraw.Draw(img)

    f_title = get_font(38)
    f_sub = get_font(20)
    f_body = get_font(16)
    f_small = get_font(13)

    # Top dark promotional banner
    draw.rectangle([0, 0, 1280, 130], fill="#0f172a")
    draw.text((60, 28), "Smart Google Search Quick Action Widget", font=f_title, fill="#ffffff")
    draw.text((60, 80), "Search any PDF topic on Google — get instant 1-click tools right inside the search results!", font=f_sub, fill="#94a3b8")

    # Mock Google Search interface
    gy = 160
    # Google logo text
    draw.text((80, gy + 10), "G", font=get_font(32), fill="#4285f4")
    draw.text((106, gy + 10), "o", font=get_font(32), fill="#ea4335")
    draw.text((126, gy + 10), "o", font=get_font(32), fill="#fbbc05")
    draw.text((146, gy + 10), "g", font=get_font(32), fill="#4285f4")
    draw.text((168, gy + 10), "l", font=get_font(32), fill="#34a853")
    draw.text((178, gy + 10), "e", font=get_font(32), fill="#ea4335")

    # Google Search bar
    draw_rounded_rect(draw, [230, gy + 4, 980, gy + 54], 25, fill="#ffffff", outline="#dfe1e5", width=2)
    draw.text((260, gy + 18), "compress pdf to 100kb", font=f_body, fill="#202124")
    draw.text((940, gy + 18), "🔍", font=f_body, fill="#5f6368")

    # Injected PDF Media Suite Widget
    wy = gy + 85
    draw_rounded_rect(draw, [230, wy, 1120, wy + 260], 16, fill="#ffffff", outline="#cbd5e1", width=2)

    # Widget Header
    draw_rounded_rect(draw, [230, wy, 1120, wy + 60], 16, fill="#f8fafc")
    draw.rectangle([230, wy + 40, 1120, wy + 60], fill="#f8fafc")
    # Red icon
    draw_rounded_rect(draw, [250, wy + 12, 286, wy + 48], 8, fill="#ef4444")
    draw.text((256, wy + 18), "PDF", font=get_font(12), fill="#ffffff")
    draw.text((298, wy + 14), "PDF Media Suite", font=get_font(17), fill="#0f172a")
    draw.text((298, wy + 35), "110+ Free Tools • In-Search Action", font=f_small, fill="#64748b")

    # Badge on right
    draw_rounded_rect(draw, [1000, wy + 15, 1100, wy + 45], 15, fill="#fef2f2", outline="#fecaca")
    draw.text((1012, wy + 22), "⚡ MATCHED", font=get_font(11), fill="#ef4444")

    # Matched Tool Card
    draw_rounded_rect(draw, [250, wy + 75, 1100, wy + 155], 12, fill="#f8fafc", outline="#e2e8f0")
    draw.text((270, wy + 88), "Compress PDF to Target Size", font=get_font(20), fill="#0f172a")
    draw.text((270, wy + 118), "Compress PDF to exact 100 KB, 200 KB or 500 KB without watermark or quality loss.", font=f_body, fill="#64748b")
    # Action button
    draw_rounded_rect(draw, [940, wy + 90, 1080, wy + 140], 10, fill="#ef4444")
    draw.text((962, wy + 104), "Open Free →", font=get_font(15), fill="#ffffff")

    # Quick pills
    pills = ["⚡ Compress", "📑 Merge PDF", "📝 PDF to Word", "🇮🇳 Sarkari Photo", "🔓 Unlock PDF", "🚀 All 110+ Tools"]
    px = 250
    for p in pills:
        pw = len(p) * 10 + 20
        is_accent = ("All 110+" in p)
        fill = "#ef4444" if is_accent else "#ffffff"
        text_col = "#ffffff" if is_accent else "#334155"
        border = "#ef4444" if is_accent else "#cbd5e1"
        draw_rounded_rect(draw, [px, wy + 172, px + pw, wy + 205], 16, fill=fill, outline=border)
        draw.text((px + 12, wy + 180), p, font=get_font(13), fill=text_col)
        px += pw + 8

    # Widget Footer
    draw.text((250, wy + 225), "🔒 100% Client-side privacy • No watermarks • Files auto-deleted • pdfmediasuite.in", font=f_small, fill="#64748b")

    # Simulated normal Google result below
    ry = wy + 285
    draw.text((230, ry), "PDF Media Suite: 110+ Free Online PDF & Document Tools", font=get_font(14), fill="#202124")
    draw.text((230, ry + 22), "https://www.pdfmediasuite.in › compress", font=f_small, fill="#4d5156")
    draw.text((230, ry + 44), "Target PDF Compress Online Free — PDF Media Suite", font=get_font(22), fill="#1a0dab")
    draw.text((230, ry + 78), "Compress PDF files online for free. Specify target file size in KB or MB with 0 watermark.", font=f_body, fill="#4d5156")

    img.save(os.path.join(OUT_DIR, "screenshot-2.png"), format="PNG")
    print("✓ screenshot-2.png generated (1280x800)")

# ─── SCREENSHOT 3: Tab Detection & Context Menus (1280 x 800) ─────────────────
def make_screenshot_3():
    img = Image.new("RGB", (1280, 800), color="#090d16")
    draw = ImageDraw.Draw(img)

    f_badge = get_font(18)
    f_title = get_font(40)
    f_sub = get_font(21)
    f_tool = get_font(17)
    f_desc = get_font(14)

    # Top Pill
    draw_rounded_rect(draw, [80, 50, 420, 84], 16, fill="#2a1215", outline="#dc2626", width=1)
    draw.text((100, 58), "🔴 ACTIVE DETECTION & CONTEXT MENUS", font=f_badge, fill="#f87171")

    # Headline
    draw.text((80, 100), "Smart Browser Integration", font=f_title, fill="#ffffff")
    draw.text((80, 155), "Auto-detects open PDF tabs with red badge + 10+ right-click context actions.", font=f_sub, fill="#94a3b8")

    # Left Card: PDF Tab Detection
    draw_rounded_rect(draw, [80, 220, 600, 720], 18, fill="#131b2e", outline="#334155", width=2)
    # Header inside card
    draw_rounded_rect(draw, [80, 220, 600, 280], 18, fill="#1e293b")
    draw.rectangle([80, 250, 600, 280], fill="#1e293b")
    draw.text((105, 238), "📄 Active PDF Tab Detection", font=get_font(20), fill="#f8fafc")

    draw.text((105, 305), "When viewing any PDF in Chrome:", font=f_tool, fill="#cbd5e1")
    draw.text((105, 335), "• Extension icon displays red 'PDF' badge in toolbar", font=f_desc, fill="#94a3b8")
    draw.text((105, 365), "• Opens instant action banner with 1-click tools:", font=f_desc, fill="#94a3b8")

    # Simulated Banner
    draw_rounded_rect(draw, [105, 410, 575, 500], 12, fill="#2a1215", outline="#dc2626")
    draw.text((125, 425), "📄 PDF Detected on Active Tab!", font=get_font(16), fill="#f87171")
    draw.text((125, 450), "sample-aadhaar-statement.pdf", font=f_desc, fill="#cbd5e1")
    # Quick buttons
    draw_rounded_rect(draw, [125, 475, 245, 505], 6, fill="#ef4444")
    draw.text((140, 482), "⚡ Compress", font=get_font(12), fill="#ffffff")
    draw_rounded_rect(draw, [255, 475, 375, 505], 6, fill="#334155")
    draw.text((270, 482), "📝 Word (.docx)", font=get_font(12), fill="#ffffff")
    draw_rounded_rect(draw, [385, 475, 485, 505], 6, fill="#334155")
    draw.text((400, 482), "More Tools →", font=get_font(12), fill="#ffffff")

    # Shortcut Callout
    draw_rounded_rect(draw, [105, 530, 575, 620], 12, fill="#1e293b", outline="#334155")
    draw.text((125, 545), "⌨️ Global Keyboard Shortcut", font=get_font(16), fill="#f8fafc")
    draw.text((125, 575), "Press  Ctrl+Shift+P  (or  Cmd+Shift+P  on Mac)", font=get_font(14), fill="#38bdf8")
    draw.text((125, 595), "Instantly launches the toolsuite from any webpage or tab.", font=f_desc, fill="#94a3b8")

    # Right Card: Simulated Right-Click Context Menu
    draw_rounded_rect(draw, [660, 220, 1200, 720], 18, fill="#131b2e", outline="#334155", width=2)
    # Header
    draw_rounded_rect(draw, [660, 220, 1200, 280], 18, fill="#1e293b")
    draw.rectangle([660, 250, 1200, 280], fill="#1e293b")
    draw.text((685, 238), "📋 Right-Click Context Menus (10+ Actions)", font=get_font(20), fill="#f8fafc")

    # Simulated Context Menu Box
    my = 300
    draw_rounded_rect(draw, [685, my, 1175, my + 380], 14, fill="#0f172a", outline="#475569", width=2)

    menu_items = [
        ("🔴 PDF Media Suite (110+ Tools)", True, False),
        ("  📄 Save this Webpage as PDF", False, False),
        ("  📸 Screenshot Page to PDF", False, False),
        ("  ⚡ Compress this PDF Link", False, False),
        ("  📝 Convert PDF → Word (.docx)", False, False),
        ("  📊 Convert PDF → Excel (.xlsx)", False, False),
        ("  🔓 Unlock (Remove Password) PDF", False, False),
        ("  🖼️ Convert this Image to PDF", False, False),
        ("  ✂️ Remove Image Background", False, False),
        ("  🇮🇳 Sarkari Photo & Signature (20-50 KB)", False, False),
        ("  🚀 Browse All 110+ Tools...", False, False),
    ]
    iy = my + 10
    for label, is_parent, is_sep in menu_items:
        if is_parent:
            draw.text((705, iy), label, font=get_font(15), fill="#ef4444")
        else:
            draw.text((705, iy), label, font=get_font(13), fill="#f8fafc")
        iy += 33

    img.save(os.path.join(OUT_DIR, "screenshot-3.png"), format="PNG")
    print("✓ screenshot-3.png generated (1280x800)")

# ─── SMALL PROMO TILE: 440 x 280 ─────────────────────────────────────────────
def make_small_promo():
    img = Image.new("RGB", (440, 280), color="#090d16")
    draw = ImageDraw.Draw(img)

    # Glow
    draw.ellipse([250, -50, 500, 200], fill="#2a1215")

    # Red logo badge
    draw_rounded_rect(draw, [30, 30, 80, 80], 14, fill="#ef4444")
    draw.text((40, 48), "PDF", font=get_font(18), fill="#ffffff")

    draw.text((100, 38), "PDF Media Suite", font=get_font(22), fill="#ffffff")
    draw.text((100, 66), "110+ Free Tools", font=get_font(14), fill="#f87171")

    # Main text
    draw.text((30, 115), "All-in-One PDF & Image Suite", font=get_font(20), fill="#f8fafc")
    draw.text((30, 145), "Compress • Merge • Convert • Scan", font=get_font(14), fill="#94a3b8")
    draw.text((30, 168), "Sarkari Photo & Signature Maker", font=get_font(14), fill="#94a3b8")

    # Bottom pill
    draw_rounded_rect(draw, [30, 215, 230, 252], 10, fill="#ef4444")
    draw.text((45, 224), "⚡ 100% Free & Private", font=get_font(13), fill="#ffffff")

    draw.text((250, 226), "pdfmediasuite.in", font=get_font(13), fill="#64748b")

    img.save(os.path.join(OUT_DIR, "small-promo-440x280.png"), format="PNG")
    print("✓ small-promo-440x280.png generated (440x280)")

# ─── MARQUEE PROMO TILE: 1400 x 560 ──────────────────────────────────────────
def make_marquee_promo():
    img = Image.new("RGB", (1400, 560), color="#090d16")
    draw = ImageDraw.Draw(img)

    # Decorative glows
    draw.ellipse([900, -200, 1600, 600], fill="#221226")
    draw.ellipse([-100, 250, 600, 850], fill="#1c111a")

    # Badge
    draw_rounded_rect(draw, [80, 60, 400, 95], 16, fill="#2a1215", outline="#dc2626")
    draw.text((100, 68), "⚡ OFFICIAL CHROME & EDGE EXTENSION", font=get_font(16), fill="#f87171")

    # Title & Subtitle
    draw.text((80, 120), "PDF Media Suite — 110+ Free Tools", font=get_font(48), fill="#ffffff")
    draw.text((80, 195), "The ultimate in-browser document & image companion. 100% private, free forever.", font=get_font(22), fill="#94a3b8")

    # 4 Feature Pills
    pills = [
        ("⚡ Smart Compress", "Reduce size to target KB/MB"),
        ("📝 PDF to Word / Excel", "Accurate format conversion"),
        ("🇮🇳 Sarkari Photo & Sign", "20-50 KB format for KYC"),
        ("📷 Document Scanner", "Auto crop & magic color"),
    ]
    px = 80
    for title, desc in pills:
        draw_rounded_rect(draw, [px, 270, px + 280, 360], 14, fill="#131b2e", outline="#334155")
        draw.text((px + 20, 288), title, font=get_font(18), fill="#f8fafc")
        draw.text((px + 20, 318), desc, font=get_font(13), fill="#94a3b8")
        px += 300

    # Bottom bar
    draw.text((80, 480), "🔒 100% Client-side privacy • No watermarks • No signup required • pdfmediasuite.in", font=get_font(16), fill="#64748b")

    img.save(os.path.join(OUT_DIR, "marquee-promo-1400x560.png"), format="PNG")
    print("✓ marquee-promo-1400x560.png generated (1400x560)")

if __name__ == "__main__":
    make_screenshot_1()
    make_screenshot_2()
    make_screenshot_3()
    make_small_promo()
    make_marquee_promo()
    print("\n🎉 All Chrome Web Store graphics successfully created in:", OUT_DIR)

