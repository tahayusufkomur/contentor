"use client";

// Shared admin-kit (schema-driven admin renderer).
// Gallery list mode: image cards + a whole-surface drop-a-PNG-to-add zone.
// Presentational — upload wiring, CRUD and the JSON modal live in ModelPage.

import { useRef, useState } from "react";
import { ImageIcon, ImagePlus, Inbox, Loader2 } from "lucide-react";

import type { ImageValue, ModelMeta, Row, RowValue } from "./types";

import { KitButton } from "./primitives";

function imageOf(value: RowValue | undefined): ImageValue | null {
  return value &&
    typeof value === "object" &&
    "key" in value &&
    "url" in value
    ? (value as ImageValue)
    : null;
}

export function GalleryView({
  meta,
  rows,
  uploading,
  uploadError,
  onCardClick,
  onFile,
}: {
  meta: ModelMeta;
  rows: Row[];
  uploading: boolean;
  uploadError: string;
  onCardClick: (row: Row) => void;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const imageField = meta.gallery_image_field ?? "";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`space-y-4 rounded-lg p-4 ${dragOver ? "ring-2 ring-[hsl(var(--primary))]" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <KitButton
          variant="primary"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
          Add PNG
        </KitButton>
        <p className="text-xs text-muted-foreground">
          …or drag &amp; drop a PNG anywhere here.
        </p>
        {uploadError && (
          <p className="text-xs text-destructive">{uploadError}</p>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Inbox className="h-8 w-8" />
          <p className="text-sm">
            No {meta.label_plural.toLowerCase()} yet — drop a PNG to add the
            first one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rows.map((row) => {
            const pk = String(row[meta.pk_field]);
            const image = imageOf(row[imageField]);
            const title = String(row.title ?? pk);
            const enabled = "enabled" in row ? Boolean(row.enabled) : null;
            return (
              <button
                key={pk}
                type="button"
                onClick={() => onCardClick(row)}
                className="flex flex-col overflow-hidden rounded-xl border text-left transition-colors hover:border-[hsl(var(--primary))]"
              >
                <div className="flex h-32 items-center justify-center bg-white p-3">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image.url}
                      alt={title}
                      className="max-h-full max-w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 border-t p-2.5">
                  <span className="truncate text-xs font-medium" title={title}>
                    {title}
                  </span>
                  {enabled !== null && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        enabled
                          ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {enabled ? "Live" : "Off"}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
