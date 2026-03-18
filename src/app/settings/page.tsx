"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    __fleetcoreWallpaper?: {
      setWallpaperDataUrl: (dataUrl: string) => void;
      clearWallpaper: () => void;
      getStoredWallpaper: () => string | null;
    };
  }
}

export default function SettingsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compressImageToDataUrl = async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image."));
        img.src = objectUrl;
      });

      const maxDim = 1920;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
      const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is not supported.");

      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.85;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      const maxChars = 2_500_000;

      while (dataUrl.length > maxChars && quality > 0.5) {
        quality = Math.max(0.5, quality - 0.1);
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }

      return dataUrl;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  useEffect(() => {
    const stored = window.__fleetcoreWallpaper?.getStoredWallpaper?.() ?? null;
    setPreview(stored);
  }, []);

  const handlePick = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const handleFile = async (file: File | null) => {
    setError(null);
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }

    try {
      const result = await compressImageToDataUrl(file);
      try {
        window.__fleetcoreWallpaper?.setWallpaperDataUrl?.(result);
      } catch {
        setError("Failed to save background image.");
        return;
      }
      setPreview(result);
    } catch {
      setError("Failed to process image.");
    }
  };

  const handleClear = () => {
    window.__fleetcoreWallpaper?.clearWallpaper?.();
    setPreview(null);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-6 p-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
          <p className="text-sm text-gray-900/80 mt-1">Customize FleetCore appearance</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl rounded-xl border border-white/10 shadow-sm p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Background image</h2>
            <p className="text-xs text-gray-900/70 mt-1">
              Pick an image from your PC. This will be saved in your browser and used as the wallpaper across the app.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handlePick}
              className="px-4 py-2 rounded-md bg-black text-white text-sm font-medium hover:bg-gray-900 transition-colors"
            >
              Choose image
            </button>

            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-2 rounded-md bg-white/20 text-gray-900 text-sm font-medium border border-white/20 hover:bg-white/30 transition-colors"
              disabled={!preview}
            >
              Reset to default
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {error && <div className="text-sm text-red-700">{error}</div>}

          <div className="rounded-lg border border-white/10 bg-white/5 backdrop-blur p-3">
            <div className="text-[11px] font-semibold text-gray-900/80 mb-2">Preview</div>
            {preview ? (
              <div
                className="h-48 rounded-md border border-white/10"
                style={{
                  backgroundImage: `url('${preview}')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            ) : (
              <div className="h-48 rounded-md border border-white/10 flex items-center justify-center text-sm text-gray-900/70">
                No custom background selected.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
