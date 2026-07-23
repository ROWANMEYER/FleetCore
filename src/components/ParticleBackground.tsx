"use client";

import { useEffect, useRef } from "react";

// ─── Colour palettes ─────────────────────────────────────────────────────────
const DARK_COLORS  = ["#60a5fa","#a78bfa","#34d399","#f472b6","#fbbf24","#38bdf8","#c084fc"];
const LIGHT_COLORS = ["#ef4444","#3b82f6","#f59e0b","#8b5cf6","#ec4899","#10b981","#f97316"];

const COUNT   = 80;   // particles in the semi-circle arc
const RADIUS  = 90;   // arc radius around cursor
const ARC     = Math.PI; // half circle (π radians = 180°)

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isDark = () => document.documentElement.classList.contains("dark");
    const palette = () => isDark() ? DARK_COLORS : LIGHT_COLORS;
    const rand = (a: number, b: number) => Math.random() * (b - a) + a;

    // ── Resize ────────────────────────────────────────────────────────────────
    let W = 0, H = 0;
    const NAV = 64;
    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight - NAV;
    };
    resize();
    window.addEventListener("resize", resize);

    // ── Mouse tracking ────────────────────────────────────────────────────────
    // Start off-screen so arc doesn't appear at (0,0) before first move
    const mouse = { x: -9999, y: -9999 };
    let mouseAngle = 0; // direction mouse is moving — arc opens toward this

    let prevMx = -9999, prevMy = -9999;

    const onMove = (e: MouseEvent) => {
      const nx = e.clientX;
      const ny = e.clientY - NAV;
      if (prevMx > -1000) {
        const dx = nx - prevMx, dy = ny - prevMy;
        if (Math.abs(dx) + Math.abs(dy) > 1) mouseAngle = Math.atan2(dy, dx);
      }
      prevMx = nx; prevMy = ny;
      mouse.x = nx; mouse.y = ny;
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      mouse.x = t.clientX; mouse.y = t.clientY - NAV;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onTouch, { passive: true });

    // ── Particle definition ───────────────────────────────────────────────────
    interface P {
      // Position along the arc: offset index 0..COUNT-1
      slot: number;
      // Each particle has a slight radial wobble
      rOffset: number;
      rSpeed:  number;
      rPhase:  number;
      // Opacity pulse
      opBase:  number;
      opSpeed: number;
      opPhase: number;
      // Visual
      len:   number;
      width: number;
      color: string;
      // Smoothed world position (lerped toward target each frame)
      x: number;
      y: number;
    }

    const mkParticle = (i: number): P => ({
      slot:    i,
      rOffset: rand(-12, 12),
      rSpeed:  rand(0.008, 0.025),
      rPhase:  rand(0, Math.PI * 2),
      opBase:  rand(0.5, 0.95),
      opSpeed: rand(0.02, 0.05),
      opPhase: rand(0, Math.PI * 2),
      len:     rand(6, 14),
      width:   rand(1.5, 3),
      color:   palette()[Math.floor(rand(0, palette().length))],
      x: -9999,
      y: -9999,
    });

    const particles: P[] = Array.from({ length: COUNT }, (_, i) => mkParticle(i));

    // ── Visibility pause ──────────────────────────────────────────────────────
    let paused = false;
    const onVis = () => { paused = document.hidden; };
    document.addEventListener("visibilitychange", onVis);

    // ── Smoothed mouse angle (lerp to avoid jumpy arc flips) ─────────────────
    let smoothAngle = 0;

    let raf = 0;
    let t = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (paused) return;
      t += 0.016;

      ctx.clearRect(0, 0, W, H);

      // Lerp the arc direction toward mouse movement direction
      // Use shortest-path angle lerp
      let da = mouseAngle - smoothAngle;
      while (da >  Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      smoothAngle += da * 0.06;

      const onScreen = mouse.x > -1000;

      for (const p of particles) {
        // Spread particles evenly across the semi-circle arc
        // slot 0 = one end, slot COUNT-1 = other end
        const frac = p.slot / (COUNT - 1); // 0..1
        // Arc spans from (smoothAngle - ARC/2) to (smoothAngle + ARC/2)
        // Opening faces the direction of travel
        const baseAngle = smoothAngle + Math.PI + (frac - 0.5) * ARC;

        // Radial wobble
        const r = RADIUS + p.rOffset + Math.sin(t * p.rSpeed * 60 + p.rPhase) * 8;

        // Target position
        const tx = mouse.x + Math.cos(baseAngle) * r;
        const ty = mouse.y + Math.sin(baseAngle) * r;

        if (!onScreen) {
          p.x = tx; p.y = ty; // snap when off-screen
          continue;
        }

        // Smooth follow — particles trail behind cursor
        const lag = 0.08 + (p.slot / COUNT) * 0.06; // outer slots lag more
        if (p.x < -1000) { p.x = tx; p.y = ty; } // first frame snap
        p.x += (tx - p.x) * lag;
        p.y += (ty - p.y) * lag;

        // Opacity pulse
        const op = p.opBase + Math.sin(t * p.opSpeed * 60 + p.opPhase) * 0.2;

        // Draw dash oriented along the arc tangent
        const tangentAngle = baseAngle + Math.PI / 2;
        const hx = Math.cos(tangentAngle) * p.len / 2;
        const hy = Math.sin(tangentAngle) * p.len / 2;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, op));
        ctx.strokeStyle = p.color;
        ctx.lineWidth   = p.width;
        ctx.lineCap     = "round";
        ctx.beginPath();
        ctx.moveTo(p.x - hx, p.y - hy);
        ctx.lineTo(p.x + hx, p.y + hy);
        ctx.stroke();
        ctx.restore();
      }
    };

    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onTouch);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 64,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "calc(100% - 64px)",
        zIndex: 0,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    />
  );
}
