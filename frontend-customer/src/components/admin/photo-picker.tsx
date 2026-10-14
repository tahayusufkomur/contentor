"use client";

import { useState } from "react";
import { Image as ImageIcon, X } from "lucide-react";
import { ImageLibraryDialog } from "@/components/admin/blog/image-library-dialog";
import { Button } from "@/components/ui/button";
import { clientFetch } from "@/lib/api-client";
import type { Photo } from "@/types/photo";

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

      {/* Her photos, Contentor's, or the whole library: every pick arrives as
          an ordinary tenant Photo, fetched in full for the caller. */}
      <ImageLibraryDialog
        open={open}
        onOpenChange={setOpen}
        title={label}
        onSelect={async (picked) =>
          onSelect(await clientFetch<Photo>(`/api/v1/photos/${picked.id}/`))
        }
      />
    </div>
  );
}
