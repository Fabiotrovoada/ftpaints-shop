'use client';
import { useEffect, useState } from 'react';

const TIPS = [
  '🎨 Over 33,000 products from leading brands',
  '🚐 FTPaints Van Delivery available in your area',
  '🏪 Click & Collect from our Coventry trade counter',
  '💳 Pay on account — 30 day trade terms',
  '📦 Mirka, Indasa, Mipa, Capella & more',
  '⚡ Bulk pricing on all products — buy more, save more',
  '🔧 Trusted by bodyshops across the UK',
  '🌟 Your professional trade partner since day one',
];

export default function Loading() {
  const [tip, setTip] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setTip(t => (t + 1) % TIPS.length);
        setFade(true);
      }, 300);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-[#004475] flex flex-col items-center justify-center z-50">
      {/* Logo area */}
      <div className="mb-10 text-center">
        <div className="text-white text-4xl font-black tracking-tight mb-1">
          FT<span className="text-[#ff8f00]">Paints</span>
        </div>
        <div className="text-blue-200 text-sm font-medium tracking-widest uppercase">
          Trade Portal
        </div>
      </div>

      {/* Animated paint roller */}
      <div className="mb-10 relative">
        <div className="w-16 h-16 relative">
          {/* Spinner */}
          <svg className="animate-spin w-16 h-16" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.15)" strokeWidth="4"/>
            <path
              d="M32 4 A28 28 0 0 1 60 32"
              stroke="#ff8f00"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
          {/* Center icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl">🎨</span>
          </div>
        </div>
      </div>

      {/* Loading bar */}
      <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden mb-8">
        <div className="h-full bg-[#ff8f00] rounded-full animate-pulse"
          style={{ width: '60%', animation: 'loading-bar 2s ease-in-out infinite' }}
        />
      </div>

      {/* Rotating tip */}
      <div className="px-8 text-center max-w-xs">
        <p
          className="text-white/80 text-sm leading-relaxed transition-opacity duration-300"
          style={{ opacity: fade ? 1 : 0 }}
        >
          {TIPS[tip]}
        </p>
      </div>

      {/* Dots */}
      <div className="flex gap-1.5 mt-6">
        {TIPS.map((_, i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full transition-all duration-300"
            style={{ background: i === tip ? '#ff8f00' : 'rgba(255,255,255,0.3)' }}
          />
        ))}
      </div>

      <style>{`
        @keyframes loading-bar {
          0% { width: 20%; margin-left: 0; }
          50% { width: 60%; margin-left: 20%; }
          100% { width: 20%; margin-left: 0; }
        }
      `}</style>
    </div>
  );
}
