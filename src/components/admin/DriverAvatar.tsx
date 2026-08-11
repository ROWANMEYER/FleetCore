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
   The camera button opens a file picker and uploads via the
   fleet.uploadDriverPhoto action (base64 → Convex storage → photoUrl);
   the trash button appears once a photo is set and calls
   fleet.removeDriverPhoto. */

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

  const pickFile = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      addToast("Please choose an image file", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast("Image is too large (max 5MB)", "error");
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await uploadPhoto({ driverId, image: String(reader.result) });
        addToast("Photo uploaded", "success");
      } catch (e: any) {
        addToast(e.message || String(e), "error");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    };
    reader.onerror = () => {
      addToast("Could not read the file", "error");
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    };
    reader.readAsDataURL(file);
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
