"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/src/components/common/Toast";
import { LongPressPhoto } from "@/src/components/common/LongPressPhoto";
import { CropPhotoModal } from "@/src/components/common/CropPhotoModal";
import { Camera, ImagePlus, Loader, Trash2, X } from "lucide-react";

/* ─── Driver avatar with photo upload/remove (Admin → Drivers) ───
   Shows the driver's photo (drivers.photoUrl) when set, otherwise a
   deterministic initials placeholder (stable gradient per driver).
   The "banner" variant fills its parent via absolute positioning — the
   parent must be a positioned (relative) element, as the drivers card's
   image area is.
   The camera button opens a file picker. The picked image is
   downscaled client-side (canvas, max 900px, JPEG) before upload —
   real camera photos are multi-MB, which blows past Convex's action
   arg size limit and can make FileReader readAsDataURL fail on
   low-memory phones. The small data URL goes to the
   fleet.uploadDriverPhoto action (Convex storage → photoUrl); the
   trash button appears once a photo is set and calls
   fleet.removeDriverPhoto.

   HEIC/HEIF photos (iPhones, and Android "High efficiency" mode)
   can't be decoded by canvas directly, so when one is picked (or a
   file fails to decode) the on-demand heic2any WASM converts it to
   JPEG first. Decoding uses createImageBitmap so EXIF orientation is
   respected automatically. */

const MAX_PHOTO_BYTES = 50 * 1024 * 1024; // sanity cap before downscaling (decode memory on phones)

function looksLikeHeic(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return (
    type.includes("heic") ||
    type.includes("heif") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

/** Convert a HEIC/HEIF file to a JPEG blob using the on-demand heic2any WASM. */
async function convertHeicToJpeg(file: File): Promise<Blob> {
  try {
    const mod = await import("heic2any");
    const result = await mod.default({ blob: file, toType: "image/jpeg", quality: 0.9 });
    return Array.isArray(result) ? result[0] : result;
  } catch {
    throw new Error("Could not convert this photo");
  }
}

/** Decode the file (converting HEIC first if needed) and return an object URL
    for the crop editor (the HEIC case yields a converted JPEG URL — a raw
    HEIC URL won't render in an <img>). The URL must be revoked by the caller
    when the crop flow finishes. */
async function fileToObjectUrl(file: File): Promise<string> {
  if (looksLikeHeic(file)) {
    const jpeg = await convertHeicToJpeg(file);
    return URL.createObjectURL(jpeg);
  }
  return URL.createObjectURL(file);
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
  photoOriginalUrl,
  variant = "avatar",
  caption,
}: {
  driverId: Id<"drivers">;
  name?: string;
  photoUrl?: string;
  /* Untouched original photo — long-press shows this full-size instead of the
     cropped display photo. */
  photoOriginalUrl?: string;
  /* "avatar" = small round chip (default); "banner" = fills its parent and
     becomes the main visual of the image-first driver card. */
  variant?: "avatar" | "banner";
  /* Optional caption shown over the banner (e.g. "#DRV-01"). */
  caption?: string;
}) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const uploadPhoto = useAction(api.fleet.uploadDriverPhoto);
  const removePhoto = useMutation(api.fleet.removeDriverPhoto);
  const { addToast } = useToast();

  // Deterministic gradient per driver so the placeholder is stable.
  const seed = [...(name ?? driverId)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const gradient = GRADIENTS[seed % GRADIENTS.length];

  const pickFile = async (file?: File | null) => {
    if (!file) return;
    // Reject clearly non-image files, but let empty-typed files through
    // (some platforms report HEIC/HEIF picks with an empty MIME type — the
    // decode/conversion path then gives a precise error if it truly fails).
    const hasImageType = file.type.startsWith("image/");
    if (!hasImageType && !looksLikeHeic(file) && file.type !== "") {
      addToast("Please choose an image file", "error");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      addToast("This image is very large — please use one under 50MB", "error");
      return;
    }
    try {
      // Open the crop editor immediately — decoding a big camera photo takes
      // seconds, so never block on it here. If the file is corrupt/fake, the
      // crop modal's <img> fails to load and its onError surfaces the friendly
      // toast (the old direct-upload flow showed it at pick time; same UX, no
      // double decode of large files).
      const url = await fileToObjectUrl(file);
      setCropSrc(url);
    } catch (e: any) {
      const msg = String(e?.message || e);
      addToast(
        msg.includes("Could not convert")
          ? "Could not convert this photo — please save it as a JPEG or PNG"
          : msg.includes("Could not decode")
            ? "Could not process this image — please use a JPEG or PNG"
            : msg,
        "error"
      );
    } finally {
      if (galleryRef.current) galleryRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const cancelCrop = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const confirmCrop = async (croppedImage: string, originalImage: string) => {
    const srcUrl = cropSrc;
    if (!srcUrl) return;
    setUploading(true);
    try {
      // Both images come from the crop editor (already decoded there) — the
      // original is the untouched photo downscaled to 2x the crop edge, stored
      // alongside so long-press can show the full image.
      await uploadPhoto({ driverId, image: croppedImage, originalImage });
      addToast("Photo uploaded", "success");
      URL.revokeObjectURL(srcUrl);
      setCropSrc(null);
    } catch (e: any) {
      const msg = String(e?.message || e);
      addToast(
        msg.includes("Could not convert")
          ? "Could not convert this photo — please save it as a JPEG or PNG"
          : msg.includes("Could not decode")
            ? "Could not process this image — please use a JPEG or PNG"
            : msg,
        "error"
      );
    } finally {
      setUploading(false);
    }
  };

  /* Open a hidden file input WITHOUT flipping the card. The button's own
     click stops propagation, but input.click() then fires a FRESH click event
     on the input that bubbles up to the flip-card root's onClick and spins the
     card — so a one-time native listener swallows it before it reaches the
     card (the chooser still opens: stopPropagation doesn't cancel the default
     action). */
  const triggerInput = (ref: React.RefObject<HTMLInputElement | null>) => {
    const input = ref.current;
    if (!input) return;
    input.addEventListener("click", (ev) => ev.stopPropagation(), { once: true });
    input.click();
  };

  /* Camera button → small action sheet: take a photo with the native camera
     or choose from the gallery. Two separate inputs keep capture="environment"
     (opens the phone's camera) and the plain file picker as independent
     fallbacks — if one misbehaves on a device, the other still works. */
  const openPickerMenu = () => setPickerOpen(true);

  const handleRemove = async () => {
    try {
      await removePhoto({ driverId });
      addToast("Photo removed", "success");
    } catch (e: any) {
      addToast(e.message || String(e), "error");
    }
  };

  if (variant === "banner") {
    return (
      // Fills the parent by absolute positioning (the parent must be
      // `relative`, as in the drivers card's image area) — NOT h-full:
      // a `height: 100%` child of a `flex-1` item doesn't resolve on
      // mobile, which collapsed the panel and floated the camera button
      // above the card, clipped out of view. Same pattern as AssetImage.
      // container-type makes the initials' cqw font size scale with the
      // card width (not the viewport) — big initials fill the banner on
      // any size.
      <>
      <div className="absolute inset-0 overflow-hidden [container-type:inline-size]">
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`}>
          {photoUrl ? (
            <LongPressPhoto
              src={photoUrl}
              lightboxSrc={photoOriginalUrl || photoUrl}
              alt={name ? `${name} photo` : "Driver photo"}
              className="w-full h-full"
            >
              <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${photoUrl})` }} />
            </LongPressPhoto>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white font-black tracking-wide select-none">
              <span className="drop-shadow-lg" style={{ fontSize: "clamp(3rem, 22cqw, 5.5rem)" }}>
                {initialsOf(name)}
              </span>
            </div>
          )}
        </div>

        {caption && (
          <div className="absolute bottom-0 inset-x-0 px-3 pb-2 pt-6 bg-gradient-to-t from-black/45 to-transparent">
            <div className="text-xs font-bold text-white truncate drop-shadow">{caption}</div>
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openPickerMenu();
          }}
          title={photoUrl ? "Change photo" : "Add photo"}
          aria-label={photoUrl ? "Change photo" : "Add photo"}
          disabled={uploading}
          className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-[var(--card-bg)]/90 backdrop-blur border border-[var(--card-border)] flex items-center justify-center text-[var(--nav-text-color)] hover:text-[#06B6D4] hover:border-[#06B6D4] transition-all duration-150 shadow-md"
        >
          {uploading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
        </button>

        {photoUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            title="Remove photo"
            aria-label="Remove photo"
            disabled={uploading}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[var(--card-bg)]/90 backdrop-blur border border-[var(--card-border)] flex items-center justify-center text-[var(--nav-text-color)] hover:text-red-500 hover:border-red-500 transition-all duration-150 shadow-md"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}

        <input
          ref={galleryRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*,.heic,.heif"
          capture="environment"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
      </div>

      {/* Crop editor — shown after picking a file, before upload */}
      <CropPhotoModal
        open={cropSrc !== null}
        src={cropSrc ?? ""}
        alt={name ? `${name} photo` : "Driver photo"}
        outputSize={1200}
        onCancel={cancelCrop}
        onConfirm={confirmCrop}
        onError={() => {
          cancelCrop();
          addToast("Could not process this image — please use a JPEG or PNG", "error");
        }}
      />

      {/* Photo source sheet — take a photo or choose from the gallery */}
      <PhotoPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onTake={() => {
          setPickerOpen(false);
          triggerInput(cameraRef);
        }}
        onGallery={() => {
          setPickerOpen(false);
          triggerInput(galleryRef);
        }}
      />
      </>
    );
  }

  return (
    <div className="relative shrink-0">
      <div
        className={`w-12 h-12 rounded-full overflow-hidden shadow-md bg-gradient-to-br ${gradient} ${
          photoUrl ? "" : "ring-2 ring-[var(--card-border)]"
        }`}
      >
        {photoUrl ? (
          <LongPressPhoto
            src={photoUrl}
            lightboxSrc={photoOriginalUrl || photoUrl}
            alt={name ? `${name} photo` : "Driver photo"}
            className="w-full h-full"
          >
            <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${photoUrl})` }} />
          </LongPressPhoto>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm tracking-wide select-none">
            {initialsOf(name)}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openPickerMenu();
        }}
        title={photoUrl ? "Change photo" : "Add photo"}
        aria-label={photoUrl ? "Change photo" : "Add photo"}
        disabled={uploading}
        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-[var(--nav-text-color)] hover:text-[#06B6D4] hover:border-[#06B6D4] transition-all duration-150 shadow-sm"
      >
        {uploading ? <Loader className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
      </button>

      {photoUrl && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleRemove();
          }}
          title="Remove photo"
          aria-label="Remove photo"
          disabled={uploading}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-[var(--nav-text-color)] hover:text-red-500 hover:border-red-500 transition-all duration-150 shadow-sm"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      )}

      <input
        ref={galleryRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0])}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0])}
      />

      {/* Crop editor — shown after picking a file, before upload */}
      <CropPhotoModal
        open={cropSrc !== null}
        src={cropSrc ?? ""}
        alt={name ? `${name} photo` : "Driver photo"}
        outputSize={1200}
        onCancel={cancelCrop}
        onConfirm={confirmCrop}
        onError={() => {
          cancelCrop();
          addToast("Could not process this image — please use a JPEG or PNG", "error");
        }}
      />

      {/* Photo source sheet — take a photo or choose from the gallery */}
      <PhotoPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onTake={() => {
          setPickerOpen(false);
          triggerInput(cameraRef);
        }}
        onGallery={() => {
          setPickerOpen(false);
          triggerInput(galleryRef);
        }}
      />
    </div>
  );
}

/* ─── Photo source sheet ──────────────────────────────────────────
   Small action sheet (portaled to <body> so the flip-card transforms can
   never clip it) with the two ways to add a driver photo: the native camera
   (capture input) and the gallery file picker. */
function PhotoPickerSheet({
  open,
  onClose,
  onTake,
  onGallery,
}: {
  open: boolean;
  onClose: () => void;
  onTake: () => void;
  onGallery: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm m-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
          <span className="text-sm font-bold text-[var(--foreground)]">Add photo</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)]/40 transition-colors"
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
        <div className="p-1.5">
          <button
            type="button"
            onClick={onTake}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--card-border)]/40 transition-colors"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-md shadow-[rgba(6,182,212,0.3)]">
              <Camera size={17} strokeWidth={2.25} />
            </span>
            Take photo
            <span className="ml-auto text-[10px] text-[var(--nav-text-color)]">camera</span>
          </button>
          <button
            type="button"
            onClick={onGallery}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--card-border)]/40 transition-colors"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-md shadow-[rgba(6,182,212,0.3)]">
              <ImagePlus size={17} strokeWidth={2.25} />
            </span>
            Choose from gallery
            <span className="ml-auto text-[10px] text-[var(--nav-text-color)]">files</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─── Tiny driver avatar for dense list/table contexts ───
   A small round photo (or deterministic initials on a gradient) used in
   sheets, QuickSend and the calendar — anywhere a full DriverAvatar is
   too heavy. Read-only: no camera/remove buttons, no upload logic. */
export function DriverThumb({
  name,
  photoUrl,
  photoOriginalUrl,
  size = 20,
  className = "",
}: {
  name?: string;
  photoUrl?: string;
  photoOriginalUrl?: string;
  size?: number;
  className?: string;
}) {
  const seed = [...(name ?? "?")].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const gradient = GRADIENTS[seed % GRADIENTS.length];
  const font = Math.max(8, Math.round(size * 0.42));
  if (photoUrl) {
    return (
      <LongPressPhoto
        src={photoUrl}
        lightboxSrc={photoOriginalUrl || photoUrl}
        alt={name ? `${name} photo` : ""}
        className={`rounded-full ${className}`}
      >
        <img
          src={photoUrl}
          alt={name ? `${name} photo` : ""}
          title={name}
          loading="lazy"
          className="rounded-full object-cover shrink-0"
          style={{ width: size, height: size }}
        />
      </LongPressPhoto>
    );
  }
  return (
    <div
      className={`rounded-full bg-gradient-to-br ${gradient} text-white flex items-center justify-center font-bold select-none shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: font }}
      title={name}
    >
      {initialsOf(name)}
    </div>
  );
}
