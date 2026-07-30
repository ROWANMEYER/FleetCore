"use client";

import { useEffect, useState } from "react";

export function AmbientBackground() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
      {/* Blob 1 — Primary teal */}
      <div
        className="ambient-blob animate-blob-drift"
        style={{
          width: "clamp(300px, 40vw, 600px)",
          height: "clamp(300px, 40vw, 600px)",
          top: "-10%",
          right: "-5%",
          background: "var(--blob-1)",
        }}
      />

      {/* Blob 2 — Teal accent */}
      <div
        className="ambient-blob animate-blob-drift-reverse"
        style={{
          width: "clamp(250px, 30vw, 500px)",
          height: "clamp(250px, 30vw, 500px)",
          bottom: "-5%",
          left: "10%",
          background: "var(--blob-2)",
        }}
      />

      {/* Blob 3 — Purple accent */}
      <div
        className="ambient-blob animate-blob-drift-slow"
        style={{
          width: "clamp(200px, 25vw, 400px)",
          height: "clamp(200px, 25vw, 400px)",
          top: "40%",
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--blob-3)",
        }}
      />
    </div>
  );
}
