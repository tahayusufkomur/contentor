"use client";

import { useState } from "react";
import { Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientFetch } from "@/lib/api-client";
import type { Photo } from "@/types/photo";
import { MediaPickerBase, uploadToPresignedUrl, type PresignResponse } from "./media-picker-base";

interface PhotoPickerProps {
  value?: string | null;
  previewUrl?: string | null;
  onSelect: (photo: Photo) => void;
  onClear?: () => void;
  label?: string;
}

export function PhotoPicker({
  value,
  previewUrl,
  onSelect,
  onClear,
  label = "Choose photo",
}: PhotoPickerProps) {
  const [open, setOpen] = useState(false);

  async function fetchPhotos(search: string): Promise<Photo[]> {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    const data = await clientFetch<{ results: Photo[] }>(
      `/api/v1/photos/${params}`,
    );
    return data.results;
  }

  async function uploadPhoto(
    file: File,
    onProgress: (percent: number) => void,
  ) {
    const { upload_url, s3_key } = await clientFetch<PresignResponse>(
      "/api/v1/upload/presign/",
      {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type,
          category: "photo",
        }),
      },
    );

    await uploadToPresignedUrl(upload_url, file, onProgress);

    const result = await clientFetch<{
      photo_id: string;
      s3_key: string;
      signed_url: string;
    }>("/api/v1/upload/complete/", {
      method: "POST",
      body: JSON.stringify({
        s3_key,
        category: "photo",
        content_type: file.type,
        file_size: file.size,
        title: file.name.replace(/\.[^.]+$/, ""),
      }),
    });

    // Fetch the full photo object and auto-select it
    const photo = await clientFetch<Photo>(`/api/v1/photos/${result.photo_id}/`);
    onSelect(photo);
    setOpen(false);
  }

  // A raw s3 key (e.g. "demo/photos/x.jpg") must never become an <img src> —
  // the browser resolves it relative to the page and 404s. Only render values
  // that are absolute, root-relative, or object URLs.
  const candidateUrl = previewUrl || value;
  const displayUrl =
    candidateUrl && /^(https?:\/\/|\/|data:|blob:)/.test(candidateUrl)
      ? candidateUrl
      : null;

  return (
    <div className="space-y-2">
      {/* Preview + trigger */}
      <div className="flex items-center gap-3">
        {displayUrl ? (
          <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-md border bg-muted">
            <img
              src={displayUrl}
              alt="Selected"
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-md border bg-muted">
            <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
          </div>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
          >
            {label}
          </Button>
          {displayUrl && onClear && (
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <MediaPickerBase<Photo>
        open={open}
        onClose={() => setOpen(false)}
        title="Choose a photo"
        searchPlaceholder="Search photos..."
        itemLabelPlural="photos"
        accept="image/*"
        contentClassName="p-4"
        itemsContainerClassName="grid grid-cols-3 gap-3 sm:grid-cols-4"
        fetchItems={fetchPhotos}
        uploadFile={uploadPhoto}
        renderItem={(photo) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => {
              onSelect(photo);
              setOpen(false);
            }}
            className="group relative aspect-square overflow-hidden rounded-md border bg-muted transition-all hover:ring-2 hover:ring-primary"
          >
            {photo.signed_url ? (
              <img
                src={photo.signed_url}
                alt={photo.alt_text || photo.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <ImageIcon className="h-5 w-5 text-muted-foreground/30" />
              </div>
            )}
          </button>
        )}
      />
    </div>
  );
}
