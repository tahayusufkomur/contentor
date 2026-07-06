"use client";

import { FileText, ImageOff } from "lucide-react";

import type { MessageAttachment } from "@/lib/platform-mailbox-api";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentList({
  attachments,
}: {
  attachments: MessageAttachment[];
}) {
  if (attachments.length === 0) return null;
  const images = attachments.filter(
    (a) => !a.omitted && a.content_type.startsWith("image/"),
  );
  const files = attachments.filter(
    (a) => a.omitted || !a.content_type.startsWith("image/"),
  );

  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <a
              key={a.id}
              href={a.download_url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-lg border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- presigned URL host varies */}
              <img
                src={a.download_url}
                alt={a.filename}
                className="h-28 w-auto object-cover"
              />
            </a>
          ))}
        </div>
      )}
      {files.map((a) =>
        a.omitted ? (
          <div
            key={a.id}
            className="inline-flex items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground"
          >
            <ImageOff className="h-3.5 w-3.5" />
            <span className="max-w-[220px] truncate">{a.filename}</span>
            <span>— too large, ask the sender to share another way</span>
          </div>
        ) : (
          <a
            key={a.id}
            href={a.download_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs hover:bg-accent"
          >
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="max-w-[220px] truncate font-medium">
              {a.filename}
            </span>
            <span className="text-muted-foreground">{humanSize(a.size)}</span>
          </a>
        ),
      )}
    </div>
  );
}
