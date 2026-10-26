"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createSplashLifecycle } from "@/src/lib/splashLifecycle";
import css from "./SplashScreen.module.css";

export default function SplashScreen({ onComplete, ready = true }: { onComplete: () => void; ready?: boolean }) {
  const [artworkSettled, setArtworkSettled] = useState(false);
  const [exiting, setExiting] = useState(false);
  const lifecycle = useRef<ReturnType<typeof createSplashLifecycle> | null>(null);
  useEffect(() => {
    const controller = createSplashLifecycle(onComplete, () => setExiting(true));
    lifecycle.current = controller;
    return () => { controller.dispose(); lifecycle.current = null; };
  }, [onComplete]);
  useEffect(() => { lifecycle.current?.setReady(ready); }, [ready]);
  useEffect(() => { if (artworkSettled) lifecycle.current?.settleArtwork(); }, [artworkSettled]);

  return <div className={css.splash} data-exiting={exiting} role="status" aria-label="FleetCore is loading">
    <Image src="/images/splash/fleetcore-road-map.webp" alt="" fill unoptimized loading="eager" fetchPriority="high" sizes="100vw"
      className={css.artwork} onLoad={() => setArtworkSettled(true)} onError={() => setArtworkSettled(true)} />
    <button type="button" className={css.skip} aria-label="Skip splash screen" onClick={() => {
      if (lifecycle.current) lifecycle.current.skip();
      else onComplete();
    }} />
    <span className={css.skipHint}>Tap anywhere to continue</span>
    <div className={css.shade} aria-hidden="true" />
    <div className={css.routes} aria-hidden="true">
      <svg viewBox="0 0 853 1844" preserveAspectRatio="xMidYMid slice">
        <circle cx="158" cy="120" r="11" /><circle cx="401" cy="266" r="11" /><circle cx="725" cy="445" r="11" />
      </svg>
    </div>
    <div className={css.brand}>
      <div className={css.logo} aria-hidden="true"><svg viewBox="0 0 48 48" fill="currentColor"><rect x="9" y="27" width="8" height="14" rx="3" /><rect x="20" y="17" width="8" height="24" rx="3" /><rect x="31" y="7" width="8" height="34" rx="3" /></svg></div>
      <h1>FleetCore</h1><p>People. Freight. Solutions.</p>
      <span className={css.spinner} aria-hidden="true" />
    </div>
  </div>;
}
