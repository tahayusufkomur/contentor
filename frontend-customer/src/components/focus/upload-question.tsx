"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";

import { uploadDownloadFile } from "@/lib/downloads/upload";
import { useAsyncAction } from "@shared/hooks/use-async-action";

/** "Add the file" in focus mode: her file goes on the draft download (the
 *  record exists from her first answer), with progress; once it is there,
 *  `onDone` answers the question. A tap: nothing here is read by a model. */
export function UploadQuestion({
  downloadId,
  onDone,
}: {
  downloadId: number;
  onDone: () => void;
}) {
  const t = useTranslations("admin");
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const { run: upload, loading } = useAsyncAction(
    async (file: File | undefined) => {
      if (!file) return;
      setProgress(0);
      try {
        await uploadDownloadFile(downloadId, file, setProgress);
      } finally {
        setProgress(null);
      }
      onDone();
    },
    { errorToast: t("downloads.uploadFailed") },
  );

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="focus-upload"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!loading) void upload(e.dataTransfer.files[0]);
        }}
        className={`block cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : "bg-background"
        }`}
      >
        <Upload className="mx-auto h-6 w-6 text-muted-foreground/60" />
        <span className="mt-1 block text-sm text-muted-foreground">
          {t("focus.kinds.download.drop")}
        </span>
        <input
          id="focus-upload"
          type="file"
          className="sr-only"
          disabled={loading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // the same file again, after a failure, counts
            void upload(file);
          }}
        />
      </label>
      {progress !== null && (
        <div className="space-y-1" role="status">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary motion-safe:transition-all motion-safe:duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("downloads.progress", { pct: progress })}
          </p>
        </div>
      )}
    </div>
  );
}
