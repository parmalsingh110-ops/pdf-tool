import { useEffect, useState, useRef, useCallback } from 'react';

interface Step {
  icon: string;
  label: string;
  detail: string;
}

interface BackendLoaderProps {
  title?: string;
  steps?: Step[];
  tips?: string[];
  accentColor?: 'blue' | 'emerald' | 'orange' | 'indigo' | 'violet';
}

const DEFAULT_STEPS: Step[] = [
  { icon: '📤', label: 'Uploading', detail: 'Securely sending your file to server...' },
  { icon: '🔍', label: 'Analyzing', detail: 'Detecting structure, fonts & layouts...' },
  { icon: '⚙️', label: 'Processing', detail: 'Backend engine is working its magic...' },
  { icon: '✨', label: 'Finalizing', detail: 'Polishing the output for perfection...' },
];

const DEFAULT_TIPS = [
  '💡 Files are processed on our secure server and never stored permanently.',
  '⚡ Our backend uses Python\'s most powerful PDF processing libraries.',
  '🔒 Privacy first: Your data is auto-deleted right after you download.',
  '📊 Fun fact: We can handle PDFs with 1000+ pages seamlessly.',
  '🌐 Auto-OCR detects scanned pages and makes them searchable.',
];

const PALETTES = {
  blue:    { a: '#3b82f6', b: '#6366f1', glow: 'rgba(99,102,241,0.4)',  text: '#93c5fd' },
  emerald: { a: '#10b981', b: '#06b6d4', glow: 'rgba(16,185,129,0.4)',  text: '#6ee7b7' },
  orange:  { a: '#f97316', b: '#f59e0b', glow: 'rgba(249,115,22,0.4)',  text: '#fcd34d' },
  indigo:  { a: '#6366f1', b: '#8b5cf6', glow: 'rgba(139,92,246,0.4)',  text: '#c4b5fd' },
  violet:  { a: '#8b5cf6', b: '#ec4899', glow: 'rgba(139,92,246,0.4)',  text: '#f0abfc' },
};

interface Particle { id: number; x: number; y: number; size: number; dy: number; dx: number; opacity: number; hue: number }

function useInterval(fn: () => void, ms: number) {
  const cb = useRef(fn);
  useEffect(() => { cb.current = fn; }, [fn]);
  useEffect(() => {
    const id = setInterval(() => cb.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export default function BackendLoader({
  title = 'Processing…',
  steps = DEFAULT_STEPS,
  tips = DEFAULT_TIPS,
  accentColor = 'blue',
}: BackendLoaderProps) {
  const pal = PALETTES[accentColor];

  const [activeStep, setActiveStep] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [tipFade, setTipFade] = useState(true);
  const [progress, setProgress] = useState(3);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [angle, setAngle] = useState(0);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    setParticles(Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: 20 + Math.random() * 80,
      size: 2 + Math.random() * 5,
      dy: 0.06 + Math.random() * 0.1,
      dx: (Math.random() - 0.5) * 0.05,
      opacity: 0.1 + Math.random() * 0.35,
      hue: Math.random() * 60 - 30,
    })));
  }, []);

  // Spinner angle
  useInterval(() => setAngle(a => (a + 4) % 360), 16);

  // Pulse ring
  useInterval(() => setPulse(p => !p), 950);

  // Steps
  useInterval(() => setActiveStep(s => (s + 1) % steps.length), 2400);

  // Tips with fade
  useInterval(() => {
    setTipFade(false);
    setTimeout(() => { setTipIdx(i => (i + 1) % tips.length); setTipFade(true); }, 380);
  }, 3800);

  // Progress
  useInterval(() => {
    setProgress(p => {
      if (p > 94) return p + 0.05;
      if (p > 78) return p + 0.2;
      if (p > 55) return p + 0.45;
      return p + 1.1;
    });
  }, 150);

  // Float particles
  useInterval(() => {
    setParticles(prev => prev.map(p => {
      let ny = p.y - p.dy;
      let nx = p.x + p.dx + Math.sin(Date.now() * 0.0008 + p.id * 0.7) * 0.06;
      if (ny < -8) { ny = 108; nx = Math.random() * 100; }
      if (nx < 0) nx = 100;
      if (nx > 100) nx = 0;
      return { ...p, x: nx, y: ny };
    }));
  }, 28);

  const pct = Math.min(progress, 97);

  const grad = `linear-gradient(90deg, ${pal.a}, ${pal.b})`;

  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 20,
      background: 'linear-gradient(145deg, #0d1117 0%, #161b2e 40%, #0d1117 100%)',
      border: `1.5px solid ${pal.a}35`,
      boxShadow: `0 0 80px ${pal.glow}, 0 24px 64px rgba(0,0,0,0.6)`,
      padding: '36px 28px 32px',
    }}>
      {/* Grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
        `,
        backgroundSize: '36px 36px',
      }} />

      {/* Glow blob behind orb */}
      <div style={{
        position: 'absolute',
        width: 200, height: 200,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${pal.a}20 0%, transparent 70%)`,
        top: -60, left: '50%', transform: 'translateX(-50%)',
        pointerEvents: 'none',
        animation: 'none',
      }} />

      {/* Particles */}
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          left: `${p.x}%`, top: `${p.y}%`,
          width: p.size, height: p.size,
          borderRadius: '50%',
          background: pal.a,
          opacity: p.opacity,
          filter: 'blur(1.2px)',
          pointerEvents: 'none',
          transition: 'top 0.028s linear, left 0.028s linear',
        }} />
      ))}

      {/* ─── ORB ─── */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24, position: 'relative', height: 88 }}>
        {/* Outer pulse */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 88, height: 88,
          transform: `translate(-50%,-50%) scale(${pulse ? 1.22 : 1})`,
          borderRadius: '50%',
          border: `1.5px solid ${pal.a}40`,
          transition: 'transform 0.9s cubic-bezier(.4,0,.2,1)',
        }} />
        {/* Inner pulse */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 70, height: 70,
          transform: `translate(-50%,-50%) scale(${pulse ? 1 : 1.14})`,
          borderRadius: '50%',
          border: `1.5px solid ${pal.b}50`,
          transition: 'transform 0.9s cubic-bezier(.4,0,.2,1)',
        }} />

        {/* Conic spinner */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: `translate(-50%,-50%) rotate(${angle}deg)`,
          width: 58, height: 58,
          borderRadius: '50%',
          background: `conic-gradient(from 0deg, transparent 40%, ${pal.a} 70%, ${pal.b} 100%)`,
          boxShadow: `0 0 24px ${pal.glow}`,
        }}>
          {/* Mask inner circle */}
          <div style={{
            position: 'absolute', inset: 4,
            borderRadius: '50%',
            background: '#0d1117',
          }} />
        </div>

        {/* Icon center */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          fontSize: 20,
          lineHeight: 1,
          transition: 'all 0.3s',
          filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.3))',
        }}>
          {steps[activeStep]?.icon}
        </div>
      </div>

      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <h3 style={{
          margin: '0 0 5px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontWeight: 800,
          fontSize: 20,
          color: '#f8fafc',
          letterSpacing: '-0.4px',
        }}>
          {title}
        </h3>
        <p style={{
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 11.5,
          fontWeight: 700,
          color: pal.text,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
        }}>
          {steps[activeStep]?.label}
        </p>
      </div>

      {/* Steps timeline */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginBottom: 22 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {/* Connector */}
            {i < steps.length - 1 && (
              <div style={{
                position: 'absolute',
                top: 13, left: '50%',
                width: '100%', height: 2,
                background: i < activeStep
                  ? grad
                  : 'rgba(255,255,255,0.07)',
                transition: 'background 0.6s ease',
                zIndex: 0,
              }} />
            )}

            {/* Dot */}
            <div style={{
              width: 26, height: 26,
              borderRadius: '50%',
              background: i < activeStep
                ? grad
                : i === activeStep
                  ? 'transparent'
                  : 'rgba(255,255,255,0.05)',
              border: i === activeStep
                ? `2px solid ${pal.a}`
                : i < activeStep
                  ? 'none'
                  : '1.5px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1, position: 'relative',
              boxShadow: i === activeStep ? `0 0 14px ${pal.glow}` : 'none',
              transition: 'all 0.5s ease',
              fontSize: 10,
            }}>
              {i < activeStep
                ? <span style={{ color: '#fff', fontWeight: 900, fontSize: 10 }}>✓</span>
                : i === activeStep
                  ? <div style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: pal.a,
                      boxShadow: `0 0 6px ${pal.a}`,
                      animation: 'pulse-dot 1.1s ease-in-out infinite',
                    }} />
                  : <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>{i + 1}</span>
              }
            </div>

            {/* Label */}
            <span style={{
              marginTop: 7,
              fontSize: 9,
              fontWeight: i <= activeStep ? 700 : 400,
              color: i === activeStep
                ? pal.text
                : i < activeStep
                  ? 'rgba(255,255,255,0.5)'
                  : 'rgba(255,255,255,0.2)',
              textAlign: 'center',
              fontFamily: 'system-ui, sans-serif',
              transition: 'color 0.5s',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 8,
          fontFamily: 'system-ui, sans-serif',
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', fontStyle: 'italic' }}>
            {steps[activeStep]?.detail}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 800,
            background: grad,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            {Math.round(pct)}%
          </span>
        </div>

        {/* Track */}
        <div style={{
          height: 5, borderRadius: 99,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: grad,
            borderRadius: 99,
            transition: 'width 0.15s linear',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Shimmer */}
            <div style={{
              position: 'absolute', top: 0, bottom: 0,
              width: '40%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
              animation: 'shimmer-bar 1.8s linear infinite',
            }} />
          </div>
        </div>
      </div>

      {/* Tip */}
      <div style={{
        background: `${pal.a}0d`,
        border: `1px solid ${pal.a}25`,
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 12,
        color: 'rgba(255,255,255,0.55)',
        fontFamily: 'system-ui, sans-serif',
        lineHeight: 1.6,
        minHeight: 40,
        display: 'flex', alignItems: 'center',
        opacity: tipFade ? 1 : 0,
        transition: 'opacity 0.35s ease',
      }}>
        {tips[tipIdx]}
      </div>

      <style>{`
        @keyframes shimmer-bar {
          from { left: -50%; }
          to   { left: 140%; }
        }
        @keyframes pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.6); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
