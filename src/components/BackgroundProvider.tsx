"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "fleetcore.wallpaper.dataUrl";

function applyWallpaperDataUrl(dataUrl: string | null) {
  const root = document.documentElement;
  if (dataUrl && dataUrl.trim() !== "") {
    root.style.setProperty("--fleetcore-wallpaper", `url('${dataUrl}')`);
    return;
  }
  root.style.removeProperty("--fleetcore-wallpaper");
}

export function BackgroundProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      applyWallpaperDataUrl(stored);
    } catch {
      // ignore
    } finally {
      setReady(true);
    }
  }, []);

  const api = useMemo(
    () => ({
      setWallpaperDataUrl: (dataUrl: string) => {
        try {
          localStorage.setItem(STORAGE_KEY, dataUrl);
        } catch {
          // ignore
        }
        applyWallpaperDataUrl(dataUrl);
      },
      clearWallpaper: () => {
        localStorage.removeItem(STORAGE_KEY);
        applyWallpaperDataUrl(null);
      },
      getStoredWallpaper: () => {
        try {
          return localStorage.getItem(STORAGE_KEY);
        } catch {
          return null;
        }
      },
    }),
    []
  );

  return (
    <div data-wallpaper-ready={ready ? "1" : "0"} data-wallpaper-api={"1"}>
      {children}
      <WallpaperApiBridge api={api} />
    </div>
  );
}

function WallpaperApiBridge({
  api,
}: {
  api: {
    setWallpaperDataUrl: (dataUrl: string) => void;
    clearWallpaper: () => void;
    getStoredWallpaper: () => string | null;
  };
}) {
  useEffect(() => {
    (window as any).__fleetcoreWallpaper = api;
    return () => {
      try {
        delete (window as any).__fleetcoreWallpaper;
      } catch {
        // ignore
      }
    };
  }, [api]);

  return null;
}
