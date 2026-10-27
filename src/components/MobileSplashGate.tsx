"use client";

import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "@/src/components/auth/AuthProvider";
import SplashScreen from "@/src/components/SplashScreen";
import css from "./SplashScreen.module.css";
import { isMobileAppEnvironment } from "@/src/lib/appMode";

function subscribeViewport(listener: () => void) {
  const media = window.matchMedia("(max-width: 767px)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
function mobileSnapshot() { return isMobileAppEnvironment(); }
function serverSnapshot() { return true; }

/** Mount the real app behind a mobile-only overlay so its queries load in parallel. */
export default function MobileSplashGate({ children }: { children: ReactNode }) {
  const [done, setDone] = useState(false);
  const mobile = useSyncExternalStore(subscribeViewport, mobileSnapshot, serverSnapshot);
  const { loading } = useAuth();
  const complete = useCallback(() => setDone(true), []);
  const visible = mobile && !done;
  return <>
    <div className={css.app} inert={visible} aria-hidden={visible ? true : undefined}>{children}</div>
    {visible && <SplashScreen ready={!loading} onComplete={complete} />}
  </>;
}
