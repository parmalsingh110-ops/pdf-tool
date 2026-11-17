interface PearlAuroraBackgroundProps {
  /** 'home' enables richer aurora mist + floating ambient silhouettes; 'workspace' keeps tool pages calm & ultra-fast. */
  mode?: 'home' | 'workspace';
}

/**
 * High-performance Pearl Aurora Ambient Canvas:
 * - Zero CSS `filter: blur(...)` Gaussian passes (uses smooth multi-stop radial gradients instead of blur-3xl)
 * - Zero scroll-event JS ticks (`useScroll`/`useSpring` removed for 60/120fps scrolling on Windows & Mobile)
 * - Compositor-only GPU transform breathing layers (`translate3d`)
 */
export default function PearlAuroraBackground({ mode = 'home' }: PearlAuroraBackgroundProps) {
  const isHome = mode === 'home';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden -z-10 select-none"
      style={{ contain: 'strict' }}
    >
      {/* 1. Soft Top-Left Rose Aurora Glow (pure radial fade — no blur filter) */}
      <div
        className={`pms-gpu-layer pms-aurora-breathe-a absolute -top-44 -left-36 w-[560px] h-[560px] md:w-[820px] md:h-[820px] rounded-full ${
          isHome ? 'opacity-85 dark:opacity-45' : 'opacity-60 dark:opacity-30'
        }`}
        style={{
          background:
            'radial-gradient(circle at 46% 46%, rgba(255, 224, 236, 0.92) 0%, rgba(253, 186, 212, 0.42) 34%, rgba(244, 63, 94, 0.09) 62%, transparent 76%)',
        }}
      />

      {/* 2. Soft Top-Right Sky Blue Aurora Glow */}
      <div
        className={`pms-gpu-layer pms-aurora-breathe-b absolute top-[6%] -right-44 w-[540px] h-[540px] md:w-[820px] md:h-[820px] rounded-full ${
          isHome ? 'opacity-85 dark:opacity-40' : 'opacity-55 dark:opacity-25'
        }`}
        style={{
          background:
            'radial-gradient(circle at 52% 48%, rgba(219, 244, 255, 0.95) 0%, rgba(186, 230, 253, 0.45) 36%, rgba(56, 189, 248, 0.1) 64%, transparent 78%)',
        }}
      />

      {/* 3. Subtle Center Lavender Mist */}
      <div
        className={`pms-gpu-layer absolute top-[34%] left-1/2 -translate-x-1/2 w-[720px] h-[540px] md:w-[1060px] md:h-[680px] rounded-full ${
          isHome ? 'opacity-85 dark:opacity-35' : 'opacity-50 dark:opacity-20'
        }`}
        style={{
          background:
            'radial-gradient(ellipse at 50% 48%, rgba(238, 231, 255, 0.88) 0%, rgba(221, 214, 254, 0.35) 40%, rgba(124, 58, 237, 0.05) 66%, transparent 78%)',
        }}
      />

      {/* 4. Lower Soft Amber/Rose Accent Glow on Home */}
      {isHome && (
        <div
          className="pms-gpu-layer absolute bottom-[-190px] right-[8%] w-[580px] h-[440px] rounded-full opacity-70 dark:opacity-25"
          style={{
            background:
              'radial-gradient(circle at center, rgba(254, 243, 199, 0.82) 0%, rgba(255, 228, 237, 0.36) 44%, transparent 74%)',
          }}
        />
      )}

      {/* 5. Architectural Paper Grid Overlay */}
      <div
        className="absolute inset-0 opacity-[0.42] dark:opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(23, 23, 47, 0.032) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(23, 23, 47, 0.032) 1px, transparent 1px)
          `,
          backgroundSize: '44px 44px',
        }}
      />

      {/* 6. Soft Pearl Horizon Contour Ribbon (static crisp SVG paths) */}
      <svg
        className={`absolute inset-x-0 top-0 w-full ${isHome ? 'h-[620px] opacity-65' : 'h-[360px] opacity-40'} dark:opacity-20`}
        viewBox="0 0 1440 600"
        fill="none"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="pms-wave-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.16" />
            <stop offset="48%" stopColor="#7C3AED" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id="pms-wave-2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.14" />
            <stop offset="55%" stopColor="#A78BFA" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.14" />
          </linearGradient>
        </defs>
        <path
          d="M-80 390 C 260 280, 560 470, 920 350 C 1180 265, 1340 310, 1520 260"
          stroke="url(#pms-wave-1)"
          strokeWidth="1.5"
        />
        <path
          d="M-80 435 C 300 340, 620 510, 960 395 C 1220 310, 1360 345, 1520 305"
          stroke="url(#pms-wave-2)"
          strokeWidth="1.25"
        />
      </svg>

      {/* 7. Subtle Floating Pearl Paper Silhouettes (GPU CSS transform only, no backdrop-blur) */}
      {isHome && (
        <>
          <div className="hidden lg:block absolute top-[45%] left-[2.5%] -rotate-6">
            <div
              className="pms-gpu-layer pms-float-a w-24 h-32 rounded-2xl border opacity-75 dark:opacity-25 flex flex-col p-3 gap-2"
              style={{
                background: 'rgba(255, 255, 255, 0.72)',
                borderColor: 'rgba(212, 205, 232, 0.7)',
                boxShadow: '0 10px 24px -10px rgba(23, 23, 47, 0.08)',
              }}
            >
              <div className="w-7 h-2 rounded-full bg-rose-400/50" />
              <div className="w-full h-1.5 rounded-full bg-slate-300/60 dark:bg-slate-600/50" />
              <div className="w-4/5 h-1.5 rounded-full bg-slate-300/50 dark:bg-slate-600/40" />
              <div className="mt-auto w-full h-7 rounded-lg bg-[#E1F5FF]/85 dark:bg-sky-900/30 border border-sky-300/40" />
            </div>
          </div>

          <div className="hidden lg:block absolute top-[33%] right-[2.5%] rotate-6">
            <div
              className="pms-gpu-layer pms-float-b w-28 h-36 rounded-2xl border opacity-75 dark:opacity-25 flex flex-col p-3 gap-2"
              style={{
                background: 'rgba(255, 255, 255, 0.72)',
                borderColor: 'rgba(212, 205, 232, 0.7)',
                boxShadow: '0 10px 24px -10px rgba(23, 23, 47, 0.08)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="w-2.5 h-2.5 rounded-full bg-violet-400/70" />
                <span className="w-8 h-1.5 rounded-full bg-slate-300/60" />
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                <div className="h-9 rounded-lg bg-[#FFE4ED]/85 dark:bg-rose-900/30" />
                <div className="h-9 rounded-lg bg-[#EEE7FF]/85 dark:bg-violet-900/30" />
              </div>
              <div className="mt-auto w-3/4 h-1.5 rounded-full bg-slate-300/60" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
