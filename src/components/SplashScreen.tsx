'use client'
import React, { useEffect, useState } from 'react'

/**
 * Cinematic full-screen splash screen for the FleetCor mobile app.
 * Features a detailed rotating world map background with animated trucks,
 * a glowing ring, map pin drop, logo reveal, and brand text.
 */
export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState(0)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 500)
    const t2 = setTimeout(() => setPhase(2), 1200)
    const t3 = setTimeout(() => setPhase(3), 2000)
    const t4 = setTimeout(() => setPhase(4), 3500)
    const t5 = setTimeout(() => setPhase(5), 4500)
    const t6 = setTimeout(() => setExiting(true), 7000)
    const t7 = setTimeout(() => onComplete(), 8000)

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
      clearTimeout(t4); clearTimeout(t5); clearTimeout(t6); clearTimeout(t7)
    }
  }, [onComplete])

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden transition-opacity duration-1000 ${exiting ? 'opacity-0' : 'opacity-100'}`}
      style={{ background: 'linear-gradient(180deg, #0B1220 0%, #0F172A 40%, #0891B2 100%)' }}
    >
      {/* ─── South Africa map + fleet overlay (aligned) ──────── */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <div className="relative" style={{ width: '90%', aspectRatio: '600 / 500' }}>
          {/* Map image */}
          <img
            src="/world-map.svg"
            alt=""
            className="absolute inset-0 w-full h-full"
            style={{
              opacity: 0.12,
              filter: 'hue-rotate(140deg) brightness(1.8) saturate(3) contrast(1.2)',
            }}
          />
          {/* Overlay SVG — same coordinate space as the map */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 600 500" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity="0" />
              <stop offset="50%" stopColor="#22D3EE" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* ─── Waypoints (SA cities) ──────────────────────────── */}
          {/* Cape Town (90,448) George (227,449) Port Elizabeth (334,449) Durban (519,301) Johannesburg (418,169) Bloemfontein (355,274) */}

          {/* ─── Route lines drawing between SA cities ─────────── */}
          {/* Route 1: Cape Town → George (N2 coastal) */}
          <path
            id="route-ct-george"
            d="M90,448 C120,455 165,442 195,450 Q210,453 227,449"
            stroke="#22D3EE" strokeWidth="1.5" fill="none" opacity="0.5"
            strokeDasharray="400" strokeDashoffset="400"
            style={{ animation: 'route-draw 3s ease-out 0.8s forwards' }}
          />
          {/* Route 2: George → Bloemfontein (N12/N1 inland) */}
          <path
            id="route-george-bloem"
            d="M227,449 Q260,400 290,360 Q320,310 340,290 Q350,280 355,274"
            stroke="#22D3EE" strokeWidth="1.5" fill="none" opacity="0.5"
            strokeDasharray="400" strokeDashoffset="400"
            style={{ animation: 'route-draw 3.5s ease-out 3s forwards' }}
          />
          {/* Route 3: Bloemfontein → Johannesburg (N1 north) */}
          <path
            id="route-bloem-joburg"
            d="M355,274 Q370,245 385,220 Q400,195 410,180 Q415,172 418,169"
            stroke="#22D3EE" strokeWidth="1.5" fill="none" opacity="0.5"
            strokeDasharray="400" strokeDashoffset="400"
            style={{ animation: 'route-draw 3s ease-out 6s forwards' }}
          />
          {/* Route 4: Johannesburg → Durban (N3 east) */}
          <path
            id="route-joburg-durban"
            d="M418,169 Q435,195 455,220 Q480,255 500,280 Q512,295 519,301"
            stroke="#22D3EE" strokeWidth="1.5" fill="none" opacity="0.5"
            strokeDasharray="400" strokeDashoffset="400"
            style={{ animation: 'route-draw 3.5s ease-out 8.5s forwards' }}
          />
          {/* Route 5: Durban → Port Elizabeth (N2 south coast) */}
          <path
            id="route-durban-pe"
            d="M519,301 Q490,335 460,370 Q420,410 380,435 Q360,445 334,449"
            stroke="#06B6D4" strokeWidth="1.5" fill="none" opacity="0.4"
            strokeDasharray="400" strokeDashoffset="400"
            style={{ animation: 'route-draw 3.5s ease-out 11.5s forwards' }}
          />
          {/* Route 6: Port Elizabeth → Cape Town (N2 west coast) */}
          <path
            id="route-pe-ct"
            d="M334,449 Q280,452 230,450 Q170,448 120,450 Q100,450 90,448"
            stroke="#06B6D4" strokeWidth="1.5" fill="none" opacity="0.4"
            strokeDasharray="400" strokeDashoffset="400"
            style={{ animation: 'route-draw 3s ease-out 14.5s forwards' }}
          />

          {/* ─── Pulse circles at each city ────────────────────── */}
          {[
            { cx: 90, cy: 448, delay: 1.0 },
            { cx: 227, cy: 449, delay: 3.5 },
            { cx: 334, cy: 449, delay: 6.5 },
            { cx: 519, cy: 301, delay: 9.5 },
            { cx: 418, cy: 169, delay: 12.5 },
            { cx: 355, cy: 274, delay: 6.0 },
          ].map((p, i) => (
            <g key={i}>
              <circle cx={p.cx} cy={p.cy} r="4" fill="#22D3EE" opacity="0.8" />
              <circle cx={p.cx} cy={p.cy} r="4" fill="none" stroke="#22D3EE" strokeWidth="1" style={{ animation: `pulse-expand 4s ease-out ${p.delay}s infinite` }} />
              <circle cx={p.cx} cy={p.cy} r="4" fill="none" stroke="#22D3EE" strokeWidth="0.8" style={{ animation: `pulse-expand 4s ease-out ${p.delay + 1.5}s infinite` }} />
            </g>
          ))}

          {/* ─── Map pins dropping at SA cities ────────────────── */}
          {[
            { cx: 90, cy: 433, delay: 1.0 },
            { cx: 227, cy: 434, delay: 3.5 },
            { cx: 334, cy: 434, delay: 6.5 },
            { cx: 519, cy: 286, delay: 9.5 },
            { cx: 418, cy: 154, delay: 12.5 },
            { cx: 355, cy: 259, delay: 6.0 },
          ].map((p, i) => (
            <g key={i} style={{ animation: `pin-drop 1s cubic-bezier(0.34, 1.56, 0.64, 1) ${p.delay}s both` }}>
              <path d={`M${p.cx},${p.cy} C${p.cx - 6.6},${p.cy} ${p.cx - 12},${p.cy + 5.4} ${p.cx - 12},${p.cy + 12} C${p.cx - 12},${p.cy + 21} ${p.cx},${p.cy + 31} ${p.cx},${p.cy + 31} S${p.cx + 12},${p.cy + 21} ${p.cx + 12},${p.cy + 12} C${p.cx + 12},${p.cy + 5.4} ${p.cx + 6.6},${p.cy} ${p.cx},${p.cy}z`} fill="#0891B2" stroke="#22D3EE" strokeWidth="1" />
              <circle cx={p.cx} cy={p.cy + 12} r="4" fill="white" fillOpacity="0.9" />
            </g>
          ))}

          {/* ─── Trucks driving ON the route lines ────────────── */}
          {/* Truck 1: Cape Town → George */}
          <g opacity="0.6">
            <g>
              <animateMotion dur="6s" begin="1.5s" repeatCount="indefinite" rotate="auto">
                <mpath href="#route-ct-george" />
              </animateMotion>
              <rect x="-8" y="-4" width="16" height="8" rx="2" fill="#22D3EE" fillOpacity="0.9" />
              <rect x="8" y="-3" width="7" height="6" rx="1" fill="#22D3EE" fillOpacity="0.6" />
              <circle cx="-4" cy="5" r="1.8" fill="#0B1220" stroke="#22D3EE" strokeWidth="0.8" />
              <circle cx="10" cy="5" r="1.8" fill="#0B1220" stroke="#22D3EE" strokeWidth="0.8" />
            </g>
          </g>
          {/* Truck 2: George → Bloemfontein */}
          <g opacity="0.6">
            <g>
              <animateMotion dur="7s" begin="4s" repeatCount="indefinite" rotate="auto">
                <mpath href="#route-george-bloem" />
              </animateMotion>
              <rect x="-8" y="-4" width="16" height="8" rx="2" fill="#22D3EE" fillOpacity="0.9" />
              <rect x="8" y="-3" width="7" height="6" rx="1" fill="#22D3EE" fillOpacity="0.6" />
              <circle cx="-4" cy="5" r="1.8" fill="#0B1220" stroke="#22D3EE" strokeWidth="0.8" />
              <circle cx="10" cy="5" r="1.8" fill="#0B1220" stroke="#22D3EE" strokeWidth="0.8" />
            </g>
          </g>
          {/* Truck 3: Bloemfontein → Johannesburg */}
          <g opacity="0.6">
            <g>
              <animateMotion dur="6s" begin="7s" repeatCount="indefinite" rotate="auto">
                <mpath href="#route-bloem-joburg" />
              </animateMotion>
              <rect x="-8" y="-4" width="16" height="8" rx="2" fill="#06B6D4" fillOpacity="0.8" />
              <rect x="8" y="-3" width="7" height="6" rx="1" fill="#06B6D4" fillOpacity="0.5" />
              <circle cx="-4" cy="5" r="1.8" fill="#0B1220" stroke="#06B6D4" strokeWidth="0.8" />
              <circle cx="10" cy="5" r="1.8" fill="#0B1220" stroke="#06B6D4" strokeWidth="0.8" />
            </g>
          </g>
          {/* Truck 4: Johannesburg → Durban */}
          <g opacity="0.5">
            <g>
              <animateMotion dur="7s" begin="10s" repeatCount="indefinite" rotate="auto">
                <mpath href="#route-joburg-durban" />
              </animateMotion>
              <rect x="-8" y="-4" width="16" height="8" rx="2" fill="#06B6D4" fillOpacity="0.8" />
              <rect x="8" y="-3" width="7" height="6" rx="1" fill="#06B6D4" fillOpacity="0.5" />
              <circle cx="-4" cy="5" r="1.8" fill="#0B1220" stroke="#06B6D4" strokeWidth="0.8" />
              <circle cx="10" cy="5" r="1.8" fill="#0B1220" stroke="#06B6D4" strokeWidth="0.8" />
            </g>
          </g>
        </svg>
        </div>
      </div>

      {/* ─── Floating particles ────────────────────────────────── */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/5"
            style={{
              width: `${2 + Math.random() * 3}px`,
              height: `${2 + Math.random() * 3}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float-particle ${3 + Math.random() * 4}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* ─── Glowing ring ──────────────────────────────────────── */}
      <div
        className={`absolute transition-all duration-700 ease-out ${phase >= 1 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
      >
        <div className="w-40 h-40 rounded-full border-2 border-[#06B6D4]/40 animate-pulse-ring" />
      </div>

      {/* ─── Map pin drop ──────────────────────────────────────── */}
      <div
        className={`absolute transition-all duration-500 ease-in ${phase >= 2 ? 'top-1/2 opacity-0' : phase >= 1 ? 'top-[15%] opacity-100' : 'top-[-15%] opacity-0'}`}
      >
        <svg width="32" height="42" viewBox="0 0 32 42" className="drop-shadow-lg">
          <path
            d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26C32 7.163 24.837 0 16 0z"
            fill="url(#pinGradient)"
          />
          <circle cx="16" cy="16" r="7" fill="white" fillOpacity="0.9" />
          <circle cx="16" cy="16" r="3.5" fill="url(#pinGradient)" />
          <defs>
            <linearGradient id="pinGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22D3EE" />
              <stop offset="100%" stopColor="#0891B2" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* ─── Logo icon ─────────────────────────────────────────── */}
      <div
        className={`relative z-10 transition-all duration-700 ease-out ${phase >= 3 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
      >
        <div
          className={`absolute -inset-16 rounded-full transition-all duration-1000 ease-out ${phase >= 3 ? 'opacity-100 scale-100 logo-glow' : 'opacity-0 scale-50'}`}
          style={{
            background: 'radial-gradient(circle, rgba(6,182,212,0.35) 0%, rgba(6,182,212,0.12) 40%, rgba(6,182,212,0) 70%)',
          }}
        />
        <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] flex items-center justify-center shadow-2xl shadow-[#06B6D4]/40">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 3h15v13H1z" />
            <path d="M16 8h4l3 3v5h-7V8z" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
        </div>
      </div>

      {/* ─── Brand text ────────────────────────────────────────── */}
      <div
        className={`relative z-10 mt-6 transition-all duration-700 ease-out ${phase >= 4 ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
      >
        <h1 className="text-3xl font-bold tracking-tight text-white" style={{ fontFamily: 'var(--font-heading), system-ui' }}>
          Fleet<span className="text-[#22D3EE]">Core</span>
        </h1>
      </div>

      {/* ─── Tagline ───────────────────────────────────────────── */}
      <div
        className={`relative z-10 mt-2 transition-all duration-700 ease-out ${phase >= 5 ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
      >
        <p className="text-sm text-cyan-200/60 font-medium tracking-wide">
          Transport Management
        </p>
      </div>
    </div>
  )
}
