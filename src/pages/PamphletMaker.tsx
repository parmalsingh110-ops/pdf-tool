import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Megaphone,
  Download,
  Scissors,
  Palette,
  Loader2,
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { useSEO } from '../hooks/useSEO';
import { usePageSEO } from '../lib/usePageSEO';
import ToolSEOSection from '../components/ToolSEOSection';
import { downloadBlob } from '../lib/utils';
import { embedSmartFont } from '../lib/pdfFontHelper';
import { toArrayBufferBytes } from '../lib/blobUrl';
import ToolWorkspaceShell from '../components/pearl/ToolWorkspaceShell';
import { PearlScanOverlay } from '../components/pearl/PearlMotion';

interface PresetTemplate {
  id: string;
  label: string;
  category: string;
  title: string;
  punchline: string;
  badge: string;
  bullets: string[];
  contact: string;
  address: string;
}

const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    id: 'coaching',
    label: '📚 Coaching / Tuition Classes',
    category: 'Education',
    title: 'TARGET ACADEMY & COACHING',
    punchline: 'NEW BATCHES STARTING THIS MONDAY',
    badge: '3 DAYS FREE DEMO CLASSES',
    bullets: [
      'Expert Faculty for Class 9th to 12th & NEET / JEE',
      'Weekly Test Series & Printed Study Notes Provided',
      'Doubt Counter & Special Attention on Weak Students',
      'Separate Batches for Hindi & English Medium',
    ],
    contact: 'Call: 98765-43210, 91234-56789',
    address: 'Near Govt College Bus Stand, Main Road',
  },
  {
    id: 'computer',
    label: '💻 Computer & Skill Institute',
    category: 'Education',
    title: 'EXCEL COMPUTER EDUCATION',
    punchline: 'LEARN HIGH-DEMAND DIGITAL SKILLS',
    badge: 'GOVT RECOGNIZED CERTIFICATION',
    bullets: [
      'RS-CIT, DCA, PGDCA & Basic Computer Courses',
      'Advanced Tally Prime with GST & Accounting',
      'Hindi & English Typing (Speed 40+ WPM Guaranteed)',
      '100% Practical Computer Lab & Job Placement Help',
    ],
    contact: 'Call: 99887-76655, 98765-00112',
    address: 'Opposite State Bank, Station Road',
  },
  {
    id: 'clinic',
    label: '🏥 Medical & Diagnostic Camp',
    category: 'Healthcare',
    title: 'LIFECARE DENTAL & HEALTH CLINIC',
    punchline: 'MEGA FREE HEALTH CHECKUP CAMP',
    badge: 'FREE CONSULTATION & 50% OFF ON TESTS',
    bullets: [
      'Complete Dental Checkup & Painless Treatment',
      'Blood Sugar, BP, ECG & Thyroid Testing',
      'Experienced Specialist Doctors from Top Hospitals',
      'Free Medicines for Senior Citizens in Camp',
    ],
    contact: 'Appointments: 94140-12345',
    address: 'Near Gandhi Chowk, Hospital Road',
  },
  {
    id: 'opening',
    label: '🏪 Shop Grand Opening / Sale',
    category: 'Retail',
    title: 'MAHAVEER CLOTH & FASHION HUB',
    punchline: 'SHUBH AARAMBH — GRAND OPENING SALE',
    badge: 'FLAT 30% OFF ON ALL ITEMS',
    bullets: [
      'Exclusive Collection of Sarees, Suits & Kurti Sets',
      'Latest Menswear: Shirts, Jeans, Trousers & Blazers',
      'Kids Wear for All Age Groups at Wholesale Rates',
      'Assured Surprise Gift on Every Purchase above ₹1500',
    ],
    contact: 'Ph: 98290-99887',
    address: 'Shop No. 14, City Center Mall, Main Market',
  },
  {
    id: 'tolet',
    label: '🏠 To-Let / Room for Rent Notice',
    category: 'Real Estate',
    title: 'ROOMS & PG AVAILABLE FOR RENT',
    punchline: 'FOR STUDENTS & WORKING PROFESSIONALS',
    badge: 'READY TO MOVE — NO BROKERAGE',
    bullets: [
      'Spacious Furnished Rooms with Attached Washrooms',
      '24 Hours RO Water & High-Speed WiFi Facility',
      'Separate Kitchen & Inverter Power Backup',
      'Safe & Peaceful Environment near Coaching Hub',
    ],
    contact: 'Contact Owner: 97840-55443',
    address: 'Plot No. 45, Tagore Nagar, Near Metro Station',
  },
];

function cleanWinAnsi(str: string): string {
  if (!str) return '';
  return str
    .replace(/₹/g, 'Rs. ')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•·]/g, '*')
    .replace(/…/g, '...')
    .replace(/[^\x00-\x7F\u0900-\u097F]/g, ' ');
}

export default function PamphletMaker() {
  useSEO(
    'Instant Pamphlet & Flyer Maker — 4-in-1 Mass Xerox Print Layout | PDF Media Suite',
    'Create print-ready advertising pamphlets and parchis for coaching, shops, clinics, and tuition. Formats 4-in-1 or 2-in-1 on A4 sheets for low-cost mass photocopying.'
  );

  usePageSEO(
    'Instant Coaching & Shop Pamphlet Maker — Mass Xerox Flyer Layout',
    'Free online pamphlet generator for coaching centers, retail shops, and local businesses. Formats 4 identical flyers per A4 sheet with scissor cut marks for cheapest printing.',
    'pamphlet maker online, coaching parcha maker, 4 in 1 flyer print a4, xerox pamphlet layout, tuition advertisement maker, mass print flyer generator',
    '/pamphlet-maker'
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('coaching');
  const [title, setTitle] = useState<string>(PRESET_TEMPLATES[0].title);
  const [punchline, setPunchline] = useState<string>(PRESET_TEMPLATES[0].punchline);
  const [badge, setBadge] = useState<string>(PRESET_TEMPLATES[0].badge);
  const [bullet1, setBullet1] = useState<string>(PRESET_TEMPLATES[0].bullets[0]);
  const [bullet2, setBullet2] = useState<string>(PRESET_TEMPLATES[0].bullets[1]);
  const [bullet3, setBullet3] = useState<string>(PRESET_TEMPLATES[0].bullets[2]);
  const [bullet4, setBullet4] = useState<string>(PRESET_TEMPLATES[0].bullets[3]);
  const [contact, setContact] = useState<string>(PRESET_TEMPLATES[0].contact);
  const [address, setAddress] = useState<string>(PRESET_TEMPLATES[0].address);

  // Layout mode: 4-in-1 (Quarter A4) or 2-in-1 (Half A4) or 1-in-1 (Full A4)
  const [layoutMode, setLayoutMode] = useState<'4-in-1' | '2-in-1' | '1-in-1'>('4-in-1');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const prefersReduced = useReducedMotion();

  const handleTemplateChange = (tmplId: string) => {
    setSelectedTemplateId(tmplId);
    const tmpl = PRESET_TEMPLATES.find((t) => t.id === tmplId);
    if (tmpl) {
      setTitle(tmpl.title);
      setPunchline(tmpl.punchline);
      setBadge(tmpl.badge);
      setBullet1(tmpl.bullets[0] || '');
      setBullet2(tmpl.bullets[1] || '');
      setBullet3(tmpl.bullets[2] || '');
      setBullet4(tmpl.bullets[3] || '');
      setContact(tmpl.contact);
      setAddress(tmpl.address);
    }
  };

  // Generate Print-Ready Pamphlet PDF with multi-up layout
  const handleGeneratePdf = async () => {
    setIsProcessing(true);

    try {
      const doc = await PDFDocument.create();
      // A4 Standard Dimensions: 595.28 x 841.89 points
      const pageWidth = 595.28;
      const pageHeight = 841.89;

      const page = doc.addPage([pageWidth, pageHeight]);
      const allPamphletText = `${title}${punchline}${badge}${bullet1}${bullet2}${bullet3}${bullet4}${contact}${address}`;
      const fontBold = await embedSmartFont(doc, allPamphletText, { bold: true, fallback: StandardFonts.HelveticaBold });
      const fontReg = await embedSmartFont(doc, allPamphletText, { fallback: StandardFonts.Helvetica });

      // Helper to render a single pamphlet box within bounding box (x, y, w, h)
      const renderFlyer = (bx: number, by: number, bw: number, bh: number) => {
        // Outer border
        page.drawRectangle({
          x: bx + 6,
          y: by + 6,
          width: bw - 12,
          height: bh - 12,
          borderWidth: 1.5,
          borderColor: rgb(0.1, 0.1, 0.1),
        });

        // Inner header bar
        const headerH = bh * 0.16;
        page.drawRectangle({
          x: bx + 8,
          y: by + bh - headerH - 8,
          width: bw - 16,
          height: headerH,
          color: rgb(0.1, 0.1, 0.1),
        });

        // Title
        const safeTitle = cleanWinAnsi(title);
        const titleFontSize = Math.min(13, bw / 22);
        const titleWidth = fontBold.widthOfTextAtSize(safeTitle, titleFontSize);
        page.drawText(safeTitle, {
          x: bx + (bw - titleWidth) / 2,
          y: by + bh - headerH / 2 - 12,
          size: titleFontSize,
          font: fontBold,
          color: rgb(1, 1, 1),
        });

        // Punchline
        const safePunchline = cleanWinAnsi(punchline);
        const punchFontSize = Math.min(8.5, bw / 32);
        const punchWidth = fontBold.widthOfTextAtSize(safePunchline, punchFontSize);
        page.drawText(safePunchline, {
          x: bx + (bw - punchWidth) / 2,
          y: by + bh - headerH - 24,
          size: punchFontSize,
          font: fontBold,
          color: rgb(0.8, 0.1, 0.1),
        });

        // Badge pill
        const safeBadge = cleanWinAnsi(badge);
        if (safeBadge) {
          const badgeFontSize = Math.min(8, bw / 34);
          const badgeWidth = fontBold.widthOfTextAtSize(safeBadge, badgeFontSize);
          const pillW = badgeWidth + 14;
          const pillH = 16;
          const pillX = bx + (bw - pillW) / 2;
          const pillY = by + bh - headerH - 44;

          page.drawRectangle({
            x: pillX,
            y: pillY,
            width: pillW,
            height: pillH,
            color: rgb(0.95, 0.95, 0.95),
            borderColor: rgb(0.2, 0.2, 0.2),
            borderWidth: 1,
          });

          page.drawText(safeBadge, {
            x: pillX + 7,
            y: pillY + 4,
            size: badgeFontSize,
            font: fontBold,
            color: rgb(0.1, 0.1, 0.1),
          });
        }

        // Bullets
        const bullets = [bullet1, bullet2, bullet3, bullet4].filter(Boolean).map(cleanWinAnsi);
        let curY = by + bh - headerH - 65;
        const bulletFontSize = Math.min(7.5, bw / 35);

        for (const b of bullets) {
          page.drawText(`* ${b.slice(0, 48)}`, {
            x: bx + 18,
            y: curY,
            size: bulletFontSize,
            font: fontReg,
            color: rgb(0.15, 0.15, 0.15),
          });
          curY -= 15;
        }

        // Bottom Contact & Address Bar
        const footerH = bh * 0.18;
        page.drawRectangle({
          x: bx + 8,
          y: by + 8,
          width: bw - 16,
          height: footerH,
          color: rgb(0.96, 0.96, 0.96),
          borderColor: rgb(0.8, 0.8, 0.8),
          borderWidth: 1,
        });

        const safeContact = cleanWinAnsi(contact);
        const contactFontSize = Math.min(8.5, bw / 30);
        page.drawText(safeContact, {
          x: bx + 16,
          y: by + footerH - 4,
          size: contactFontSize,
          font: fontBold,
          color: rgb(0.1, 0.1, 0.1),
        });

        const safeAddress = cleanWinAnsi(address);
        const addrFontSize = Math.min(7, bw / 36);
        page.drawText(safeAddress, {
          x: bx + 16,
          y: by + 16,
          size: addrFontSize,
          font: fontReg,
          color: rgb(0.3, 0.3, 0.3),
        });
      };

      if (layoutMode === '4-in-1') {
        // 4 flyers (2x2 grid)
        const cellW = pageWidth / 2;
        const cellH = pageHeight / 2;

        renderFlyer(0, cellH, cellW, cellH); // Top Left
        renderFlyer(cellW, cellH, cellW, cellH); // Top Right
        renderFlyer(0, 0, cellW, cellH); // Bottom Left
        renderFlyer(cellW, 0, cellW, cellH); // Bottom Right

        // Draw dashed scissor cut lines
        page.drawLine({
          start: { x: cellW, y: 0 },
          end: { x: cellW, y: pageHeight },
          thickness: 0.8,
          color: rgb(0.6, 0.6, 0.6),
          dashArray: [4, 4],
        });

        page.drawLine({
          start: { x: 0, y: cellH },
          end: { x: pageWidth, y: cellH },
          thickness: 0.8,
          color: rgb(0.6, 0.6, 0.6),
          dashArray: [4, 4],
        });
      } else if (layoutMode === '2-in-1') {
        // 2 flyers (stacked vertically)
        const cellH = pageHeight / 2;
        renderFlyer(0, cellH, pageWidth, cellH);
        renderFlyer(0, 0, pageWidth, cellH);

        // Center cut line
        page.drawLine({
          start: { x: 0, y: cellH },
          end: { x: pageWidth, y: cellH },
          thickness: 0.8,
          color: rgb(0.6, 0.6, 0.6),
          dashArray: [4, 4],
        });
      } else {
        // 1-in-1 Full A4
        renderFlyer(0, 0, pageWidth, pageHeight);
      }

      const outBytes = toArrayBufferBytes(await doc.save());
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      downloadBlob(blob, `Pamphlet_${layoutMode}_${title.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Error creating pamphlet PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const layoutChoices: { id: '4-in-1' | '2-in-1' | '1-in-1'; label: string }[] = [
    { id: '4-in-1', label: '4-in-1 (Quarter A4)' },
    { id: '2-in-1', label: '2-in-1 (Half A4)' },
    { id: '1-in-1', label: '1-in-1 (Full A4)' },
  ];

  return (
    <ToolWorkspaceShell
      title="Instant Coaching & Shop Pamphlet Maker"
      subtitle="Create advertising flyers and parchis in 30 seconds. Automatically formats 4-in-1 or 2-in-1 on single A4 sheets with scissor cut marks for cheapest photocopying."
      categoryLabel="4-in-1 Mass Xerox Print Layout"
      icon={Megaphone}
      microVariant="crop"
      tone="violet"
      trustNote="Instant vector A4 print PDF · Scissor cut guidelines · 100% browser-only"
    >
      <div className="space-y-7">
        {/* Top Action Bar */}
        <div className="flex justify-end">
          <motion.button
            whileHover={prefersReduced || isProcessing ? undefined : { scale: 1.02 }}
            whileTap={prefersReduced || isProcessing ? undefined : { scale: 0.985 }}
            onClick={handleGeneratePdf}
            disabled={isProcessing}
            className="pms-btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold disabled:opacity-50 cursor-pointer"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isProcessing ? 'Generating Print PDF...' : `Download ${layoutMode} Print PDF`}
          </motion.button>
        </div>

        {/* Quick Presets Picker */}
        <div className="pms-glass-panel p-5 rounded-3xl space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Pick a Ready-to-Use Business Template:
          </span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {PRESET_TEMPLATES.map((tmpl) => {
              const active = selectedTemplateId === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  onClick={() => handleTemplateChange(tmpl.id)}
                  className="relative px-4 py-2 rounded-xl border text-xs font-bold whitespace-nowrap transition-colors cursor-pointer overflow-hidden"
                  style={{
                    borderColor: active ? 'var(--pms-violet)' : 'var(--pms-border)',
                    backgroundColor: active ? 'var(--pms-soft-lavender)' : 'var(--pms-white)',
                    color: active ? 'var(--pms-violet)' : 'var(--pms-ink)',
                  }}
                >
                  {active && (
                    <motion.span
                      layoutId="pamphlet-preset-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                      className="absolute inset-0 rounded-xl ring-2 ring-violet-500/30 pointer-events-none"
                    />
                  )}
                  <span className="relative z-10">{tmpl.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form & Live Mockup */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Customization Fields */}
          <div className="lg:col-span-7 space-y-5">
            <div className="p-6 rounded-3xl pms-glass-panel space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-[var(--pms-violet)]" /> Pamphlet Content &amp; Details
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Main Business / Coaching Name
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-800/80 font-black text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Headline / Punchline
                    </label>
                    <input
                      type="text"
                      value={punchline}
                      onChange={(e) => setPunchline(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Offer / Discount Badge
                    </label>
                    <input
                      type="text"
                      value={badge}
                      onChange={(e) => setBadge(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-800/80 font-bold text-[var(--pms-violet)] outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                </div>

                {/* 4 Feature Bullets */}
                <div className="space-y-2 pt-2 border-t border-[var(--pms-border)]">
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    Key Features / Offer Points (4 Points)
                  </label>
                  <input
                    type="text"
                    value={bullet1}
                    onChange={(e) => setBullet1(e.target.value)}
                    placeholder="Feature 1"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-800/80 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  <input
                    type="text"
                    value={bullet2}
                    onChange={(e) => setBullet2(e.target.value)}
                    placeholder="Feature 2"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-800/80 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  <input
                    type="text"
                    value={bullet3}
                    onChange={(e) => setBullet3(e.target.value)}
                    placeholder="Feature 3"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-800/80 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  <input
                    type="text"
                    value={bullet4}
                    onChange={(e) => setBullet4(e.target.value)}
                    placeholder="Feature 4"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-800/80 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--pms-border)]">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Contact Numbers
                    </label>
                    <input
                      type="text"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Shop / Center Address
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--pms-border)] bg-white/90 dark:bg-slate-800/80 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Layout Mode & Visual Preview */}
          <div className="lg:col-span-5 space-y-6">
            <div className="relative p-6 rounded-3xl pms-glass-panel space-y-4 overflow-hidden">
              <PearlScanOverlay active={isProcessing} label={`Compiling ${layoutMode} A4 print sheet…`} />

              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Scissors className="w-4 h-4 text-[var(--pms-violet)]" /> Photocopy Sheet Layout
              </h3>

              {/* Layout mode switcher */}
              <div className="grid grid-cols-3 gap-2">
                {layoutChoices.map((choice) => {
                  const active = layoutMode === choice.id;
                  return (
                    <button
                      key={choice.id}
                      onClick={() => setLayoutMode(choice.id)}
                      className="relative py-2 px-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer overflow-hidden"
                      style={{
                        borderColor: active ? 'var(--pms-violet)' : 'var(--pms-border)',
                        backgroundColor: active ? 'var(--pms-soft-lavender)' : 'var(--pms-white)',
                        color: active ? 'var(--pms-violet)' : 'var(--pms-ink)',
                      }}
                    >
                      {active && (
                        <motion.span
                          layoutId="pamphlet-layout-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                          className="absolute inset-0 rounded-xl ring-2 ring-violet-500/30 pointer-events-none"
                        />
                      )}
                      <span className="relative z-10">{choice.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Single Flyer Mockup Card (Crisp White Print Sheet Preview) */}
              <div className="border-2 border-slate-900 p-4 rounded-2xl bg-white text-slate-900 space-y-2 shadow-lg text-center">
                <div className="bg-slate-900 text-white py-2 px-3 rounded-lg font-black text-sm uppercase tracking-wide">
                  {title}
                </div>
                <div className="text-[11px] font-black text-rose-600 uppercase">{punchline}</div>
                {badge && (
                  <div className="inline-block px-3 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-900">
                    {badge}
                  </div>
                )}
                <div className="space-y-1 text-[11px] text-left pt-2 px-2 text-slate-800">
                  {[bullet1, bullet2, bullet3, bullet4].filter(Boolean).map((b, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span className="text-violet-600 font-bold">•</span>
                      <span className="truncate">{b}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t border-slate-200 text-left text-[11px] space-y-0.5">
                  <div className="font-bold text-slate-900">{contact}</div>
                  <div className="text-slate-500 text-[10px]">{address}</div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[var(--pms-soft-lavender)] border border-[var(--pms-border)] text-[11px] text-violet-800 dark:text-violet-200 flex items-center gap-2">
                <Scissors className="w-4 h-4 shrink-0" />
                <span>
                  {layoutMode === '4-in-1'
                    ? 'Generates 4 identical flyers on a single A4 sheet. Print 25 pages to get 100 flyers!'
                    : layoutMode === '2-in-1'
                    ? 'Generates 2 identical half-A4 flyers with a scissor cut line in the middle.'
                    : 'Generates a full-page A4 notice/flyer ready for pasting.'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <ToolSEOSection
          toolName="Instant Coaching & Shop Pamphlet Maker"
          headline="4-in-1 & 2-in-1 Mass Photocopy Flyer Layout for Local Businesses and Tuition Classes"
          description="A fast advertising flyer generator built for coaching centers, tuition classes, local grocery stores, clinics, and rental property owners. Formats 4 identical flyers per A4 sheet with dashed scissor cut guidelines, allowing businesses to print 100 marketing flyers from just 25 photocopies."
        />
      </div>
    </ToolWorkspaceShell>
  );
}
