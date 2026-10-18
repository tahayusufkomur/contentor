"use client";

// The Uploads drawer: a photo dropped here (or chosen from her device) joins her own photos and goes on the
// cover, the same way an upload does from the Photos drawer.

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import type { PickedPhoto } from "@/components/studio/photo-sources";
import { Section } from "@/components/studio/simple-controls";
import { Button } from "@/components/ui/button";
import { whileBusy } from "@/lib/covers/work";
import { mediaKind, uploadPhoto } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { useAsyncAction } from "@shared/hooks/use-async-action";

export function UploadsDrawer({
  onPick,
  onBusy,
  disabled = false,
}: {
  onPick: (photo: PickedPhoto) => void;
  /** Told by the upload itself: true when it starts, false once it has ended, wherever she is by then
   *  (the editor holds Keep and Discard meanwhile). */
  onBusy?: (busy: boolean) => void;
  /** Nothing can be dropped (the draft is being kept, discarded or replaced). */
  disabled?: boolean;
}) {
  const t = useTranslations("admin.studio.drawers.uploads");
  const tp = useTranslations("admin.studio.photos");
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState(0);

  const { run: upload, loading } = useAsyncAction(
    (file: File) =>
      whileBusy(onBusy, async () => {
        setProgress(0);
        const photo = await uploadPhoto(file, {
          onProgress: setProgress,
          signal: new AbortController().signal,
        });
        if (!photo.signed_url) throw new Error("No link for the new photo");
        onPick({ id: photo.id, url: photo.signed_url });
      }),
    { errorToast: tp("uploadFailed") },
  );

  /** The first photo of what was dropped or chosen goes on the cover. */
  const take = (files: FileList | null) => {
    if (disabled || loading || !files?.length) return;
    const photo = Array.from(files).find((file) => mediaKind(file) === "photo");
    if (photo) void upload(photo);
    else toast.error(t("notAPhoto"));
  };

  return (
    <Section title={t("heading")}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-colors",
          over && "border-foreground bg-accent",
        )}
      >
        <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">{t("drop")}</p>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            take(files);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          loading={loading}
          loadingText={`${progress}%`}
          onClick={() => input.current?.click()}
        >
          {t("choose")}
        </Button>
      </div>
    </Section>
  );
}
