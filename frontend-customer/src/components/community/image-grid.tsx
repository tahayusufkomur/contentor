"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { ModalPortal } from "@/components/ui/modal-portal";

export function ImageGrid({ images }: { images: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!images.length) return null;

  return (
    <>
      <div
        className={
          images.length === 1 ? "grid grid-cols-1" : "grid grid-cols-2 gap-1"
        }
      >
        {images.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(i)}
            className="overflow-hidden rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- presigned URLs, no next/image loader */}
            <img
              src={src}
              alt=""
              className="max-h-96 w-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
      {open !== null && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setOpen(null)}
          >
            <button
              className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[open]}
              alt=""
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
        </ModalPortal>
      )}
    </>
  );
}
