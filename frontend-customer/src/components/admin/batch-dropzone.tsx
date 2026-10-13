"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, File, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/format";
import { mediaKind, uploadMedia, type MediaKind } from "@/lib/upload";

interface QueuedFile {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "completed" | "error";
  error?: string;
}

/** How many files travel at once; the rest wait their turn. */
const AT_ONCE = 3;

/** The media library's one way in: drop photos and videos anywhere on the
 *  page, or pick them. Each file becomes a photo or a video by its type. */
export function BatchDropzone({
  onUploaded,
}: {
  /** Called after each file lands, with what it became. */
  onUploaded?: (kind: MediaKind) => void;
}) {
  const t = useTranslations("admin.media.upload");
  const [isDragging, setIsDragging] = useState(false);
  const [windowDragging, setWindowDragging] = useState(false);
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const waiting = useRef<QueuedFile[]>([]);
  const running = useRef(0);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const patch = useCallback((id: string, change: Partial<QueuedFile>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...change } : f)),
    );
  }, []);

  const pump = useCallback(() => {
    while (running.current < AT_ONCE && waiting.current.length) {
      const item = waiting.current.shift()!;
      running.current++;
      patch(item.id, { status: "uploading", progress: 1 });
      uploadMedia(item.file, (progress) => patch(item.id, { progress }))
        .then(() => {
          patch(item.id, { status: "completed", progress: 100 });
          onUploadedRef.current?.(mediaKind(item.file)!);
        })
        .catch((err: unknown) => {
          const error = err instanceof Error ? err.message : String(err);
          patch(item.id, { status: "error", error });
          toast.error(t("failed", { name: item.file.name }));
        })
        .finally(() => {
          running.current--;
          pump();
        });
    }
  }, [patch, t]);

  const addFiles = useCallback(
    (picked: FileList | File[]) => {
      const list = Array.from(picked);
      const refused = list.filter((file) => !mediaKind(file));
      if (refused.length) {
        toast.error(
          t("refused", { names: refused.map((f) => f.name).join(", ") }),
        );
      }
      const added: QueuedFile[] = list
        .filter((file) => mediaKind(file))
        .map((file) => ({
          id: crypto.randomUUID(),
          file,
          progress: 0,
          status: "queued",
        }));
      if (!added.length) return;
      setFiles((prev) => [...prev, ...added]);
      waiting.current.push(...added);
      pump();
    },
    [pump, t],
  );

  // Dropping anywhere on the page uploads.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) =>
      !!e.dataTransfer?.types?.includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setWindowDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (depth === 0) setWindowDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setWindowDragging(false);
      if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

  const finished = files.some(
    (f) => f.status === "completed" || f.status === "error",
  );

  return (
    <div className="space-y-4">
      {windowDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-4 border-dashed border-primary bg-primary/20 backdrop-blur-md">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-primary/30 bg-card p-8 text-center shadow-2xl">
            <UploadCloud className="h-16 w-16 text-primary motion-safe:animate-bounce" />
            <h2 className="text-xl font-bold">{t("dropAnywhere")}</h2>
          </div>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        // The window listener above takes the drop itself.
        onDrop={() => setIsDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          isDragging
            ? "border-primary bg-primary/10"
            : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          aria-label={t("pick")}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            // So picking the same file again fires a change.
            e.target.value = "";
          }}
        />
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="rounded-full bg-primary/10 p-3 text-primary">
            <UploadCloud className="h-8 w-8" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              {t.rich("prompt", {
                browse: (chunks) => (
                  <span className="text-primary underline">{chunks}</span>
                ),
              })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("hint")}</p>
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between border-b pb-2 text-xs font-semibold">
            <span>{t("queue", { count: files.length })}</span>
            {finished && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px]"
                onClick={() =>
                  setFiles((prev) =>
                    prev.filter(
                      (f) => f.status === "queued" || f.status === "uploading",
                    ),
                  )
                }
              >
                {t("clear")}
              </Button>
            )}
          </div>

          <ul className="max-h-48 space-y-2.5 overflow-y-auto">
            {files.map((item) => (
              <li
                key={item.id}
                className="space-y-1.5 rounded-lg border bg-muted/30 p-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">
                      {item.file.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatFileSize(item.file.size)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.status === "queued" && (
                      <span className="text-[10px] text-muted-foreground">
                        {t("waiting")}
                      </span>
                    )}
                    {item.status === "uploading" && (
                      <span className="font-mono text-[10px] text-primary">
                        {item.progress}%
                      </span>
                    )}
                    {item.status === "completed" && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {t("done")}
                      </span>
                    )}
                    {item.status === "error" && (
                      <span className="flex items-center gap-1 text-[10px] text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" /> {t("error")}
                      </span>
                    )}
                  </div>
                </div>
                {item.status === "uploading" && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-200"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
                {item.status === "error" && item.error && (
                  <p className="text-[11px] text-destructive">{item.error}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
