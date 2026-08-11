"use client";

import { useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/src/components/common/Toast";
import { Camera, Loader, Trash2 } from "lucide-react";

/* ─── Driver avatar with photo upload/remove (Admin → Drivers) ───
   Shows the driver's photo (drivers.photoUrl) when set, otherwise a
   deterministic initials placeholder (stable gradient per driver).
   The camera button opens a file picker. The picked image is
   downscaled client-side (canvas, max 900px, JPEG) before upload —
   real camera photos are multi-MB, which blows past Convex's action
   arg size limit and can make FileReader readAsDataURL fail on
   low-memory phones. The small data URL goes to the
   fleet.uploadDriverPhoto action (Convex storage → photoUrl); the
   trash button appears once a photo is set and calls
   fleet.removeDriverPhoto. */

const MAX_PHOTO_BYTES = 15 * 1024 * 1024; // sanity cap before downscaling (decode memory on phones)
const MAX_DIM = 900; // downscale target — avatars are tiny, so we save bandwidth
const JPEG_QUALITY = 0.85;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode this image"));
    img.src = url;
  });
}

/** Decode the file via an object URL (memory-friendly) and re-encode it
    small as a JPEG data URL. Returns the original data URL on failure so
    the user's file is never silently dropped. */
async function fileToSmallDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("Could not decode this image");
    const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported");
    // White backdrop so transparent PNGs don't flatten to black in the JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const GRADIENTS = [
  "from-[#06B6D4] to-[#0891B2]",
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
] as const;

function initialsOf(name?: string) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function DriverAvatar({
  driverId,
  name,
  photoUrl,
}: {
  driverId: Id<"drivers">;
  name?: string;
  photoUrl?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const uploadPhoto = useAction(api.fleet.uploadDriverPhoto);
  const removePhoto = useMutation(api.fleet.removeDriverPhoto);
  const { addToast } = useToast();

  // Deterministic gradient per driver so the placeholder is stable.
  const seed = [...(name ?? driverId)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const gradient = GRADIENTS[seed % GRADIENTS.length];

  const pickFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      addToast("Please choose an image file", "error");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      addToast("This image is very large — please use one under 15MB", "error");
      return;
    }
    setUploading(true);
    try {
      const image = await fileToSmallDataUrl(file);
      await uploadPhoto({ driverId, image });
      addToast("Photo uploaded", "success");
    } catch (e: any) {
      const msg = String(e?.message || e);
      addToast(
        msg.includes("Could not decode")
          ? "Could not process this image — please use a JPEG or PNG"
          : msg.includes("read the file") || msg.includes("readFile")
            ? "Could not read the file — please try another image"
            : msg,
        "error"
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    try {
      await removePhoto({ driverId });
      addToast("Photo removed", "success");
    } catch (e: any) {
      addToast(e.message || String(e), "error");
    }
  };

  return (
    <div className="relative shrink-0">
      <div
        className={`w-12 h-12 rounded-full overflow-hidden shadow-md bg-gradient-to-br ${gradient} ${
          photoUrl ? "" : "ring-2 ring-[var(--card-border)]"
        }`}
      >
        {photoUrl ? (
          <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${photoUrl})` }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm tracking-wide select-none">
            {initialsOf(name)}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title={photoUrl ? "Change photo" : "Upload photo"}
        aria-label={photoUrl ? "Change photo" : "Upload photo"}
        disabled={uploading}
        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-[var(--nav-text-color)] hover:text-[#06B6D4] hover:border-[#06B6D4] transition-all duration-150 shadow-sm"
      >
        {uploading ? <Loader className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
      </button>

      {photoUrl && (
        <button
          type="button"
          onClick={handleRemove}
          title="Remove photo"
          aria-label="Remove photo"
          disabled={uploading}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-[var(--nav-text-color)] hover:text-red-500 hover:border-red-500 transition-all duration-150 shadow-sm"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0])}
      />
    </div>
  );
}
