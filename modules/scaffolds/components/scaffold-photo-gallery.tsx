"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ChevronLeft, ChevronRight, ImagePlus, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { resizeImageForUpload } from "@/lib/images/client-image-resize";
import { uploadScaffoldPhotoAction, deleteScaffoldPhotoAction, reorderScaffoldPhotosAction } from "@/modules/scaffolds/photo-actions";
import { SCAFFOLD_PHOTOS_MAX_COUNT } from "@/modules/scaffolds/types";
import type { ScaffoldPhotoDetail } from "@/modules/scaffolds/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type ScaffoldPhotoGalleryProps = {
  companyId: string;
  projectId: string;
  scaffoldId: string;
  tagNumber: string;
  initialPhotos: ScaffoldPhotoDetail[];
  canManage: boolean;
};

type QueueItem = {
  key: string;
  file: File;
  status: "compressing" | "uploading" | "error";
  message?: string;
};

const MAX_CONCURRENT_UPLOADS = 3;

/**
 * Completion photo gallery + uploader (Part 4F). Two capture entry points
 * (mirroring standard mobile "camera vs. library" UX — the `capture`
 * attribute forces a camera-only single shot on most mobile browsers, so
 * it cannot share one input with multi-select from the library) feed the
 * same bounded-concurrency upload pipeline. Each file is resized/compressed
 * client-side (lib/images/client-image-resize.ts) before it is ever sent,
 * then uploaded via its own independent Server Action call — one file's
 * failure never blocks or rolls back another's, and the 30-photo ceiling
 * plus every real authorization/validation check is re-enforced server-side
 * regardless of what this component disables/hides.
 */
export function ScaffoldPhotoGallery({ companyId, projectId, scaffoldId, tagNumber, initialPhotos, canManage }: ScaffoldPhotoGalleryProps) {
  const [photos, setPhotos] = useState<ScaffoldPhotoDetail[]>(initialPhotos);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const remainingSlots = SCAFFOLD_PHOTOS_MAX_COUNT - photos.length - queue.length;

  const uploadOne = useCallback(
    async (item: QueueItem) => {
      setQueue((current) => current.map((entry) => (entry.key === item.key ? { ...entry, status: "compressing", message: undefined } : entry)));
      const resized = await resizeImageForUpload(item.file);

      setQueue((current) => current.map((entry) => (entry.key === item.key ? { ...entry, status: "uploading" } : entry)));
      const formData = new FormData();
      formData.set("file", resized);

      const result = await uploadScaffoldPhotoAction(companyId, projectId, scaffoldId, formData);
      if (!result.ok) {
        setQueue((current) => current.map((entry) => (entry.key === item.key ? { ...entry, status: "error", message: result.error.message } : entry)));
        return;
      }

      setQueue((current) => current.filter((entry) => entry.key !== item.key));
      setPhotos((current) => [
        ...current,
        { id: result.data.photoId, url: result.data.url, originalFilename: item.file.name, uploadedByName: null, uploadedAt: new Date().toISOString(), orderIndex: current.length },
      ]);
    },
    [companyId, projectId, scaffoldId],
  );

  const enqueueFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const allowed = Math.max(0, remainingSlots);
      if (allowed === 0) {
        toast.error(`This scaffold already has the maximum of ${SCAFFOLD_PHOTOS_MAX_COUNT} completion photos.`);
        return;
      }
      const accepted = files.slice(0, allowed);
      if (accepted.length < files.length) {
        toast.warning(`Only ${allowed} more photo${allowed === 1 ? "" : "s"} can be added — the rest were skipped.`);
      }

      const items: QueueItem[] = accepted.map((file) => ({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, status: "compressing" }));
      setQueue((current) => [...current, ...items]);

      let index = 0;
      const next = async (): Promise<void> => {
        const current = index++;
        if (current >= items.length) return;
        await uploadOne(items[current]);
        return next();
      };
      void Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_UPLOADS, items.length) }, () => next()));
    },
    [remainingSlots, uploadOne],
  );

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    enqueueFiles(files);
  }

  function retry(item: QueueItem) {
    void uploadOne(item);
  }

  function dismissFailed(key: string) {
    setQueue((current) => current.filter((entry) => entry.key !== key));
  }

  async function deletePhoto(photoId: string) {
    const previous = photos;
    setPhotos((current) => current.filter((photo) => photo.id !== photoId));
    setLightboxIndex(null);
    const result = await deleteScaffoldPhotoAction(companyId, projectId, scaffoldId, photoId);
    if (!result.ok) {
      setPhotos(previous);
      toast.error(result.error.message);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const reordered = [...photos];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const previous = photos;
    setPhotos(reordered);
    const result = await reorderScaffoldPhotosAction(
      companyId,
      projectId,
      scaffoldId,
      reordered.map((photo) => photo.id),
    );
    if (!result.ok) {
      setPhotos(previous);
      toast.error(result.error.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={handleInputChange} />
          <input ref={libraryInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleInputChange} />
          <Button type="button" variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()} disabled={remainingSlots <= 0}>
            <Camera />
            Take photo
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => libraryInputRef.current?.click()} disabled={remainingSlots <= 0}>
            <ImagePlus />
            Choose photos
          </Button>
          <span className="text-xs text-muted-foreground">
            {photos.length + queue.length}/{SCAFFOLD_PHOTOS_MAX_COUNT} · JPEG, PNG, or WebP, up to 10 MB each
          </span>
        </div>
      )}

      {queue.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {queue.map((item) => (
            <div key={item.key} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-center">
              {item.status === "error" ? (
                <>
                  <p className="text-xs text-destructive">{item.message ?? "Upload failed."}</p>
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => retry(item)}>
                      <RotateCcw />
                      Retry
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => dismissFailed(item.key)}>
                      Dismiss
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Loader2 className="animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{item.status === "compressing" ? "Preparing…" : "Uploading…"}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {photos.length === 0 && queue.length === 0 ? (
        <p className="text-sm text-muted-foreground">No completion photos yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo, index) => (
            <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg border">
              <button type="button" className="h-full w-full" onClick={() => setLightboxIndex(index)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not an optimizable static asset */}
                <img
                  src={photo.url}
                  alt={`Scaffold ${tagNumber} completion photo ${index + 1}${photo.uploadedByName ? `, uploaded by ${photo.uploadedByName}` : ""}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </button>
              {canManage && (
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <div className="flex gap-0.5">
                    <Button type="button" size="icon-sm" variant="ghost" className="text-white hover:text-white hover:bg-white/20" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move earlier">
                      <ChevronLeft />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-white hover:text-white hover:bg-white/20"
                      disabled={index === photos.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label="Move later"
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                  <Button type="button" size="icon-sm" variant="ghost" className="text-white hover:text-white hover:bg-white/20" onClick={() => deletePhoto(photo.id)} aria-label="Delete photo">
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={lightboxIndex !== null} onOpenChange={(open) => !open && setLightboxIndex(null)}>
        <DialogContent className="max-w-3xl p-2 sm:max-w-4xl" showCloseButton>
          <DialogTitle className="sr-only">
            {lightboxIndex !== null ? `Scaffold ${tagNumber} completion photo ${lightboxIndex + 1} of ${photos.length}` : "Scaffold completion photo"}
          </DialogTitle>
          {lightboxIndex !== null && photos[lightboxIndex] && (
            <div className="flex flex-col gap-2">
              <div className="flex max-h-[75vh] items-center justify-center overflow-hidden rounded-lg bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not an optimizable static asset */}
                <img src={photos[lightboxIndex].url} alt={`Scaffold ${tagNumber} completion photo ${lightboxIndex + 1}`} className="max-h-[75vh] w-auto object-contain" />
              </div>
              <div className="flex items-center justify-between px-1">
                <Button type="button" variant="outline" size="sm" disabled={lightboxIndex === 0} onClick={() => setLightboxIndex((current) => (current !== null ? current - 1 : current))}>
                  <ChevronLeft />
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  {lightboxIndex + 1} / {photos.length}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={lightboxIndex === photos.length - 1}
                  onClick={() => setLightboxIndex((current) => (current !== null ? current + 1 : current))}
                >
                  Next
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
