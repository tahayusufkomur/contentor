"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import { clientFetch } from "@/lib/api-client";
import type { Photo } from "@/types/photo";

interface PresignResponse {
  upload_url: string;
  s3_key: string;
}

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
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const data = await clientFetch<{ results: Photo[] }>(
        `/api/v1/photos/${params}`,
      );
      setPhotos(data.results);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(fetchPhotos, 300);
    return () => clearTimeout(timer);
  }, [open, fetchPhotos]);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadProgress(0);
    try {
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

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", upload_url);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(file);
      });

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
      const photo = await clientFetch<Photo>(
        `/api/v1/photos/${result.photo_id}/`,
      );
      onSelect(photo);
      setOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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

      {/* Photo library modal */}
      {open && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b px-5 py-3.5">
                <h2 className="text-sm font-semibold">Choose a photo</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 border-b p-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search photos..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 pl-8 text-sm"
                  />
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </Button>
              </div>

              {uploading && (
                <div className="space-y-1 border-b px-4 py-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {uploadProgress}% uploaded
                  </p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                  <div className="flex justify-center py-10">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : photos.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    {search ? "No photos match your search." : "No photos yet."}
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {photos.map((photo) => (
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
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
