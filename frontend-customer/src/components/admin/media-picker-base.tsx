"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import { Search, Upload, X } from "lucide-react";

export interface PresignResponse {
  upload_url: string;
  s3_key: string;
}

/** PUTs a file to a presigned S3 URL, reporting progress. Shared by every
 * picker's upload flow — identical regardless of what happens before/after. */
export function uploadToPresignedUrl(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

export interface MediaPickerBaseProps<T> {
  open: boolean;
  onClose: () => void;
  title: string; // e.g. "Choose a video" / "Choose a photo"
  searchPlaceholder: string; // e.g. "Search videos..." / "Search photos..."
  itemLabelPlural: string; // e.g. "videos" / "photos" — used in the empty-state copy
  accept: string; // file-input accept attr, e.g. "video/mp4,video/quicktime,video/webm" / "image/*"
  contentClassName: string; // padding on the scrollable items container
  itemsContainerClassName: string; // layout of the items container (list vs grid)
  fetchItems: (search: string) => Promise<T[]>;
  uploadFile: (
    file: File,
    onProgress: (percent: number) => void,
  ) => Promise<void>; // wrapper owns the full upload flow (incl. selection callback + close)
  renderItem: (item: T) => ReactNode; // wrapper owns card markup + its onClick select (must set its own `key`)
}

export function MediaPickerBase<T>({
  open,
  onClose,
  title,
  searchPlaceholder,
  itemLabelPlural,
  accept,
  contentClassName,
  itemsContainerClassName,
  fetchItems,
  uploadFile,
  renderItem,
}: MediaPickerBaseProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchItems(search));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fetchItems, search]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(refresh, 300);
    return () => clearTimeout(timer);
  }, [open, refresh]);

  async function handleFile(file: File) {
    setUploading(true);
    setUploadProgress(0);
    try {
      await uploadFile(file, setUploadProgress);
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 border-b p-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 text-sm"
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
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

          <div className={`flex-1 overflow-y-auto ${contentClassName}`}>
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {search
                  ? `No ${itemLabelPlural} match your search.`
                  : `No ${itemLabelPlural} yet.`}
              </p>
            ) : (
              <div className={itemsContainerClassName}>
                {items.map((item) => renderItem(item))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
